import { error, fail, redirect } from '@sveltejs/kit';
import { base } from '$app/paths';
import { createSupabaseAdminClient, createSupabaseServerClient } from '$lib/supabase/server-ssr';
import { isAllowedAdmin } from '$lib/server/admin-auth';
import { buildOperatorReport } from '$lib/analytics/operator-report.server';
import { assertReportDateBounds, parseReportQuery, chicagoDayStart, isPhotoRank, type PhotoRank } from '$lib/analytics/report-contract';
import { fetchV2ReportProjection, unavailableV2ReportProjection } from '$lib/analytics/v2-report-projection.server';
import { createPostHogQueryTransport, queryGalleryJourneys } from '$lib/analytics/posthog-queries.server';
import { POSTHOG_JOURNEY_REPORTS } from '$lib/analytics/posthog.types';
import { env } from '$env/dynamic/private';
import type { Actions, PageServerLoad } from './$types';


type CatalogueEntry = {album_key:string;album_name:string;photo_count:number};
type AlbumSetting = {album_key:string;visibility:string|null;published_at:string|null;published_at_basis:'recorded'|'inferred'|null};
type AlbumFact = {album_key:string;sport:string|null;event_date:string|null;event_type?:string|null};
type CategoryFact = {album_key:string;photo_category:string|null};
type V2EvidenceEvent = {event_id:string;event_name:string;occurred_at:string;album_key:string|null;photo_id:string|null;traffic_context:string};
type MeasurementHealth = {
	available:boolean; schemaVersion:number | null; pending:number | null; submitted:number | null; confirmed:number | null; failed:number | null;
	controlPending:number | null; oldestPendingAt:string | null; oldestSubmittedAt:string | null; confirmedWatermark:string | null;
	accepted:number | null; rejected:number | null; duplicate:number | null; quotaBillingState:'unknown'; eligibleObservations:number | null; eligibleDays:number | null;
	forecast30Days:number | null; forecastLimit:string;
};
const REPORT_SECTIONS = ['overview', 'albums', 'photos', 'sources', 'measurement', 'analytics-preferences'] as const;
type ReportSection = (typeof REPORT_SECTIONS)[number];

function reportSection(value: string | null): ReportSection {
	return REPORT_SECTIONS.includes(value as ReportSection) ? value as ReportSection : 'overview';
}

function boundedPage(value: string | null): number {
	return Math.max(0, Math.min(10_000, Number.parseInt(value ?? '0', 10) || 0));
}
async function readAll<T>(page:(from:number)=>PromiseLike<{data:T[]|null;error:unknown}>) {
 const data:T[]=[];
 for(let from=0;;from+=1000){const result=await page(from);if(result.error)return {data:[] as T[],error:result.error};data.push(...(result.data??[]));if((result.data??[]).length<1000)return {data,error:null};}
}

function validDate(value: string | undefined): value is string {
	return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T12:00:00Z`).getTime()) && new Date(`${value}T12:00:00Z`).toISOString().slice(0,10)===value;
}

function numberOrNull(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function parseMeasurementHealth(value: unknown): MeasurementHealth {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return { available:false, schemaVersion:null, pending:null, submitted:null, confirmed:null, failed:null, controlPending:null, oldestPendingAt:null, oldestSubmittedAt:null, confirmedWatermark:null, accepted:null, rejected:null, duplicate:null, quotaBillingState:'unknown', eligibleObservations:null, eligibleDays:null, forecast30Days:null, forecastLimit:'Delivery health is unavailable. This is not a zero or healthy result.' };
	const source=value as Record<string,unknown>;
	const collection=source.collection && typeof source.collection==='object' && !Array.isArray(source.collection) ? source.collection as Record<string,unknown> : {};
	const eligibleObservations=numberOrNull(source.eligible_observations_14d);
	const eligibleDays=numberOrNull(source.eligible_days_observed);
	const forecast30Days=eligibleObservations !== null && eligibleDays !== null && eligibleDays > 0 ? Math.round((eligibleObservations / eligibleDays) * 30) : null;
	return {
		available:true, schemaVersion:numberOrNull(source.schema_version), pending:numberOrNull(source.pending), submitted:numberOrNull(source.submitted), confirmed:numberOrNull(source.confirmed), failed:numberOrNull(source.failed), controlPending:numberOrNull(source.control_pending),
		oldestPendingAt:typeof source.oldest_pending_at==='string'?source.oldest_pending_at:null, oldestSubmittedAt:typeof source.oldest_submitted_at==='string'?source.oldest_submitted_at:null, confirmedWatermark:typeof source.confirmed_watermark==='string'?source.confirmed_watermark:null,
		accepted:numberOrNull(collection.accepted), rejected:numberOrNull(collection.rejected), duplicate:numberOrNull(collection.duplicate), quotaBillingState:'unknown', eligibleObservations, eligibleDays, forecast30Days,
		forecastLimit:forecast30Days === null ? 'No forecast is available until eligible observations cover at least one measured day. This does not imply zero traffic.' : `A simple 30-day estimate from ${(eligibleObservations ?? 0).toLocaleString()} eligible observations across ${eligibleDays ?? 0} days with eligible activity. Days with no eligible events are excluded, so this active-day estimate may overstate a calendar-month total; partial days and traffic changes add uncertainty.`
	};
}

async function requireOperator(cookies: Parameters<typeof createSupabaseServerClient>[0]) {
	const supabase = createSupabaseServerClient(cookies);
	const { data: { user } } = await supabase.auth.getUser();
	if (!user) throw redirect(302, `${base}/login`);
	if (!isAllowedAdmin(user.email)) throw error(403, 'Operator access required');
	return user;
}

function savedQueryState(query: ReturnType<typeof parseReportQuery>) {
	return {
		period: 'custom', start: query.start, end: query.end, measure: query.measure, scope: query.scope,
		albums: query.albumKeys, traffic: query.traffic,
		...(query.sport ? { sport: query.sport } : {}),
		...(query.category ? { category: query.category } : {}),
		...(query.source ? { source: query.source } : {}),
		...(query.eventDate ? { event_date: query.eventDate } : {}),
		...(query.season ? { season: query.season } : {}),
		...(query.albumEventType ? { event_type: query.albumEventType } : {}),
		compare: query.compare,
		...(query.compareStart ? { compare_start: query.compareStart } : {}),
		...(query.compareEnd ? { compare_end: query.compareEnd } : {})
	};
}

export const load: PageServerLoad = async ({ cookies, url, setHeaders }) => {
	setHeaders({
		'cache-control': 'private, no-store, max-age=0',
		'pragma': 'no-cache',
		'x-robots-tag': 'noindex, nofollow, noarchive'
	});
	const { data: { user: signedInUser } } = await createSupabaseServerClient(cookies).auth.getUser();
	const user = signedInUser && isAllowedAdmin(signedInUser.email) ? signedInUser : null;
	const query = parseReportQuery(url.searchParams);
	try {
		assertReportDateBounds(query);
	} catch (cause) {
		if (cause instanceof RangeError) throw error(400, cause.message);
		throw cause;
	}
	const section = reportSection(url.searchParams.get('section'));
	const requestedRank = url.searchParams.get('photo_rank');
	const photoRank: PhotoRank = isPhotoRank(requestedRank) ? requestedRank : 'popular';
	const photoWindow = section === 'overview'
		? { page: 0, pageSize: 4, rank: 'popular' as const }
		: section === 'photos'
			? { page: boundedPage(url.searchParams.get('photo_page')), pageSize: 12, rank: photoRank }
			: { page: 0, pageSize: 0, rank: 'popular' as const };
	const admin = createSupabaseAdminClient();
	 const eventPage=boundedPage(url.searchParams.get('event_page'));
 const dayAfter=new Date(`${query.end}T12:00:00Z`);dayAfter.setUTCDate(dayAfter.getUTCDate()+1);
 let retainedQuery=admin.from('engagement_events').select('id, album_key, photo_id, event_type, source, created_at, traffic_context').gte('created_at',chicagoDayStart(query.start)).lt('created_at',chicagoDayStart(dayAfter.toISOString().slice(0,10))).order('created_at',{ascending:false}).order('id',{ascending:false});
	let v2EvidenceQuery=admin.from('analytics_events_v2').select('event_id,event_name,occurred_at,album_key,photo_id,traffic_context').gte('occurred_at',chicagoDayStart(query.start)).lt('occurred_at',chicagoDayStart(dayAfter.toISOString().slice(0,10))).order('occurred_at',{ascending:false}).order('event_id',{ascending:false});
 let noteQuery=admin.from('analytics_sharing_annotations').select('id, album_key, activity_date, channel, note, updated_at').eq('created_by',user?.id ?? '').gte('activity_date',query.start).lte('activity_date',query.end).order('activity_date',{ascending:false});
	if(query.scope!=='all'){retainedQuery=retainedQuery.in('album_key',query.albumKeys);v2EvidenceQuery=v2EvidenceQuery.in('album_key',query.albumKeys);noteQuery=noteQuery.in('album_key',query.albumKeys);}
	const measurementSection = section === 'measurement';
	const [report, saved, annotations, albumCatalogue, albumSettings, albumFacets, categoryFacets, correctionLog, retainedEvents, v2CorrectionLog, v2EvidenceEvents, measurementHealthResult] = await Promise.all([
			buildOperatorReport(admin, query, { publicOnly: true, photoWindow, includeDiagnostics: measurementSection, includeVisitorEstimate: section === 'overview', includeToday: section === 'overview', cacheRole: 'service_role' }),
			user && section === 'sources' ? admin.from('analytics_saved_reports').select('id, name, query, updated_at').eq('owner_id', user.id).order('updated_at', { ascending: false }) : { data: [], error: null },
			user && section === 'overview' ? readAll(from=>noteQuery.range(from,from+999)) : { data: [], error: null }
		,
		readAll<CatalogueEntry>(from=>admin.from('albums_summary').select('album_key, album_name, photo_count').order('album_key').range(from,from+999)),
		readAll<AlbumSetting>(from=>admin.from('album_settings').select('album_key, visibility, published_at, published_at_basis').order('album_key').range(from,from+999)),
		readAll<AlbumFact>(from=>admin.from('albums').select('album_key, sport, event_date').order('album_key').range(from,from+999)),
		admin.rpc('analytics_category_facets') as PromiseLike<{data:CategoryFact[]|null;error:unknown}>,
			user && measurementSection ? admin.from('engagement_classification_corrections').select('id, engagement_event_id, classification, reason_flags, classification_version, note, corrected_at').order('corrected_at', { ascending: false }).limit(30) : { data: [], error: null },
			user && measurementSection ? retainedQuery.range(eventPage*50,eventPage*50+50) : { data: [], error: null }
			,
			user && measurementSection ? admin.from('analytics_event_v2_classifications').select('event_id,classification,classification_version,note,corrected_at,reversed').order('corrected_at',{ascending:false}).limit(30) : { data: [], error: null },
			user && measurementSection ? v2EvidenceQuery.range(eventPage*50,eventPage*50+50) : { data: [], error: null },
			user && measurementSection ? admin.rpc('analytics_posthog_delivery_health') : { data: null, error: null }
	]);
	if (albumSettings.error) throw error(503, 'Album visibility could not be verified.');
	const publicAlbum = (key: string) => !!user || !(albumSettings.data ?? []).some(row => row.album_key === key && row.visibility === 'unlisted');
	const unique = (values: Array<string | null | undefined>) => [...new Set(values.map(value=>value || 'unknown'))].sort();
	const settingsByAlbum = new Map((albumSettings.data ?? []).map((setting) => [setting.album_key, setting]));
	const factsByAlbum = new Map((albumFacets.data ?? []).filter(row => publicAlbum(row.album_key)).map(album=>[album.album_key,album]));
	const catalogue = (albumCatalogue.data ?? []).filter(album => publicAlbum(album.album_key)).map((album) => ({
		...album,
		sport:factsByAlbum.get(album.album_key)?.sport ?? null,
		event_date:factsByAlbum.get(album.album_key)?.event_date ?? null,
		event_type:factsByAlbum.get(album.album_key)?.event_type ?? null,
		visibility: settingsByAlbum.get(album.album_key)?.visibility ?? 'public',
		published_at: settingsByAlbum.get(album.album_key)?.published_at ?? null,
		published_at_basis: settingsByAlbum.get(album.album_key)?.published_at_basis ?? null
	})).sort((a,b)=>a.album_name.localeCompare(b.album_name));
	const matchesAlbumScope = (album: typeof catalogue[number]) =>
		(query.scope === 'all' || query.albumKeys.includes(album.album_key))
		&& (!query.sport || (album.sport ?? 'unknown') === query.sport)
		&& (!query.eventDate || album.event_date === query.eventDate)
		&& (!query.season || (album.event_date?.slice(0, 4) ?? 'unknown') === query.season)
		&& (!query.albumEventType || (album.event_type ?? 'unknown') === query.albumEventType);
	const publicScopedAlbumKeys = catalogue.filter(matchesAlbumScope).map((album) => album.album_key);
		const v2Options = { publicAlbumKeys: catalogue.map((album) => album.album_key) };
		const requestedJourneys = section === 'measurement' ? POSTHOG_JOURNEY_REPORTS : section === 'sources' ? ['sources_return' as const] : [];
		const journeyTransport = requestedJourneys.length ? createPostHogQueryTransport(env) : null;
		const [v2Report, journeys] = await Promise.all([
			measurementSection ? fetchV2ReportProjection(admin, query, v2Options) : Promise.resolve(unavailableV2ReportProjection(query, 'Version-2 evidence was not loaded for this section.')),
			Promise.all(requestedJourneys.map((report) => queryGalleryJourneys(
				journeyTransport!,
			{ report, start: query.start, end: query.end, ...(query.scope === 'all' && !query.sport && !query.eventDate && !query.season && !query.albumEventType ? {} : {albumKeys: publicScopedAlbumKeys}), source: query.source, sport: query.sport, category: query.category },
			{ publicOnly: true, allowedAlbumKeys: publicScopedAlbumKeys }
		)))
	]);
	const queryAsOf = journeys.flatMap((journey) => journey.asOf ? [journey.asOf] : []).sort().at(-1) ?? null;
	const measurementHealth = measurementHealthResult.error ? parseMeasurementHealth(null) : parseMeasurementHealth(measurementHealthResult.data);
	const eventById = new Map((retainedEvents.data ?? []).map((event) => [Number(event.id), event]));
	const missingContextIds = [...new Set((correctionLog.data ?? []).map((correction) => Number(correction.engagement_event_id)))]
		.filter((id) => !eventById.has(id));
	for (let start = 0; start < missingContextIds.length; start += 100) {
		const { data: contextRows } = await admin.from('engagement_events')
			.select('id, album_key, photo_id, event_type, source, created_at, traffic_context')
			.in('id', missingContextIds.slice(start, start + 100));
		for (const event of contextRows ?? []) eventById.set(Number(event.id), event);
	}
	const seenCorrectionEvents = new Set<number>();
	const correctionRows = (correctionLog.data ?? []).map((correction) => {
		const eventId = Number(correction.engagement_event_id);
		const canReverse = !seenCorrectionEvents.has(eventId);
		seenCorrectionEvents.add(eventId);
		return { ...correction, event: eventById.get(eventId) ?? null, canReverse };
	});
		return {
			user: user ? { id: user.id, email: user.email } : null,
			intelligenceOwner: !!user,
			section,
		report,
		v2Report,
		journeys,
		savedReports: saved.error ? [] : saved.data ?? [],
		savedReportsAvailable: !saved.error,
		annotations: annotations.error ? [] : annotations.data ?? [],
		annotationsAvailable: !annotations.error,
		albumCatalogue: albumCatalogue.error ? [] : catalogue,
		albumCatalogueAvailable: !albumCatalogue.error && !albumSettings.error,
		facets: {
			sports: albumFacets.error ? [] : unique((albumFacets.data ?? []).filter(row => publicAlbum(row.album_key)).map((row) => row.sport)),
			seasons: albumFacets.error ? [] : unique((albumFacets.data ?? []).filter(row => publicAlbum(row.album_key)).map((row) => row.event_date?.slice(0, 4))),
			eventTypes: albumFacets.error ? [] : unique((albumFacets.data ?? []).filter(row => publicAlbum(row.album_key)).map((row) => row.event_type ?? 'unknown')),
			categories: categoryFacets.error ? [] : unique((categoryFacets.data ?? []).filter(row => publicAlbum(row.album_key)).map((row) => row.photo_category))
		},
		correctionLog: correctionLog.error ? [] : correctionRows,
		correctionLogAvailable: !correctionLog.error,
		eventPage, hasMoreEvents: (retainedEvents.data?.length??0)>50,
		retainedEvents: retainedEvents.error ? [] : (retainedEvents.data ?? []).slice(0,50),
		retainedEventsAvailable: !retainedEvents.error,
		v2CorrectionLog: v2CorrectionLog.error ? [] : v2CorrectionLog.data ?? [],
		v2CorrectionLogAvailable: !v2CorrectionLog.error,
		v2EvidenceEvents: v2EvidenceEvents.error ? [] : (v2EvidenceEvents.data ?? []).slice(0,50) as V2EvidenceEvent[],
		v2EvidenceEventsAvailable: !v2EvidenceEvents.error,
		measurementHealth,
		providerQueryFreshness: { available: journeys.some((journey) => journey.available), asOf: queryAsOf, label: queryAsOf ? `Latest provider query evidence: ${queryAsOf}. This is query freshness, not delivery confirmation.` : 'No provider query freshness is available. This is not a zero-result or healthy provider state.' }
	};
};

export const actions: Actions = {
	saveReport: async ({ cookies, request, url }) => {
		const user = await requireOperator(cookies);
		const form = await request.formData();
		const name = form.get('name')?.toString().trim();
		if (!name || name.length > 100) return fail(400, { saveError: 'Give this report a name of 1–100 characters.' });
		const query = parseReportQuery(url.searchParams);
		const savedQuery = savedQueryState(query);
		const { error: insertError } = await createSupabaseAdminClient().from('analytics_saved_reports').insert({ owner_id: user.id, name, query: savedQuery });
		if (insertError) return fail(503, { saveError: 'The report could not be saved. No report was created.' });
		return { saved: true };
	},
	updateReport: async ({ cookies, request, url }) => {
		const user = await requireOperator(cookies);
		const id = (await request.formData()).get('id')?.toString();
		if (!id) return fail(400, { updateError: 'Report id is required.' });
		const query = parseReportQuery(url.searchParams);
		const savedQuery = savedQueryState(query);
		const { error: updateError } = await createSupabaseAdminClient().from('analytics_saved_reports').update({ query: savedQuery, updated_at: new Date().toISOString() }).eq('id', id).eq('owner_id', user.id);
		if (updateError) return fail(503, { updateError: 'The report could not be updated.' });
		return { updated: true };
	},
	deleteReport: async ({ cookies, request }) => {
		const user = await requireOperator(cookies);
		const id = (await request.formData()).get('id')?.toString();
		if (!id) return fail(400, { deleteError: 'Report id is required.' });
		const { error: deleteError } = await createSupabaseAdminClient().from('analytics_saved_reports').delete().eq('id', id).eq('owner_id', user.id);
		if (deleteError) return fail(503, { deleteError: 'The report could not be deleted.' });
		return { deleted: true };
	},
	addAnnotation: async ({ cookies, request }) => {
		const user = await requireOperator(cookies);
		const form = await request.formData();
		const albumKey = form.get('albumKey')?.toString().trim();
		const activityDate = form.get('activityDate')?.toString();
		const channel = form.get('channel')?.toString().trim();
		const note = form.get('note')?.toString().trim();
		if (!albumKey || !validDate(activityDate) || !channel || channel.length > 64 || !note || note.length > 2000) return fail(400, { annotationError: 'Use a valid album, date, 1–64 character channel, and 1–2,000 character note.' });
		const { error: insertError } = await createSupabaseAdminClient().from('analytics_sharing_annotations').insert({ album_key: albumKey, activity_date: activityDate, channel, note, created_by: user.id });
		if (insertError) return fail(503, { annotationError: 'The annotation could not be saved.' });
		return { annotated: true };
	},
	updateAnnotation: async ({ cookies, request }) => {
		const user = await requireOperator(cookies);
		const form = await request.formData();
		const id = form.get('id')?.toString();
		const channel = form.get('channel')?.toString().trim();
		const note = form.get('note')?.toString().trim();
		if (!id || !channel || channel.length > 64 || !note || note.length > 2000) return fail(400, { annotationError: 'Use a 1–64 character channel and 1–2,000 character note.' });
		const { error: updateError } = await createSupabaseAdminClient().from('analytics_sharing_annotations').update({ channel, note, updated_at: new Date().toISOString() }).eq('id', id).eq('created_by', user.id);
		if (updateError) return fail(503, { annotationError: 'The annotation could not be updated.' });
		return { annotationUpdated: true };
	},
	deleteAnnotation: async ({ cookies, request }) => {
		const user = await requireOperator(cookies);
		const id = (await request.formData()).get('id')?.toString();
		if (!id) return fail(400, { annotationError: 'Annotation id is required.' });
		const { error: deleteError } = await createSupabaseAdminClient().from('analytics_sharing_annotations').delete().eq('id', id).eq('created_by', user.id);
		if (deleteError) return fail(503, { annotationError: 'The annotation could not be deleted.' });
		return { annotationDeleted: true };
	},
	correctClassification: async ({ cookies, request }) => {
		const user = await requireOperator(cookies);
		const form = await request.formData();
		const eventId = Number(form.get('eventId'));
		const classification = form.get('classification')?.toString();
		const note = form.get('note')?.toString().trim();
		const allowed = new Set(['audience', 'operator', 'test', 'known_crawler', 'suspected_automation', 'unclassified']);
		if (!Number.isSafeInteger(eventId) || eventId < 1 || !classification || !allowed.has(classification) || !note || note.length > 1000) return fail(400, { correctionError: 'Use an event id, supported classification, and an auditable reason of 1–1,000 characters.' });
		const { error: correctionError } = await createSupabaseAdminClient().rpc('analytics_record_classification_correction', {
			p_event_id: eventId, p_classification: classification, p_note: note, p_corrected_by: user.id, p_reverse: false
		});
		if (correctionError) return fail(503, { correctionError: 'The correction was not recorded. Nothing changed.' });
		return { corrected: true };
	},
	undoClassification: async ({ cookies, request }) => {
		const user = await requireOperator(cookies);
		const eventId = Number((await request.formData()).get('eventId'));
		if (!Number.isSafeInteger(eventId) || eventId < 1) return fail(400, { correctionError: 'A valid event id is required.' });
		const { error: undoError } = await createSupabaseAdminClient().rpc('analytics_record_classification_correction', {
			p_event_id: eventId, p_classification: 'unclassified', p_note: 'Reversal requested by the operator.', p_corrected_by: user.id, p_reverse: true
		});
		if (undoError) return fail(503, { correctionError: 'The reversal was not recorded. Nothing changed.' });
		return { correctionUndone: true };
	},
	correctV2Classification: async ({ cookies, request }) => {
		const user = await requireOperator(cookies);
		const form = await request.formData();
		const eventId = form.get('eventId')?.toString();
		const classification = form.get('classification')?.toString();
		const note = form.get('note')?.toString().trim();
		const allowed = new Set(['audience', 'operator', 'test', 'known_crawler', 'suspected_automation', 'unclassified', 'self_excluded']);
		if (!eventId || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(eventId) || !classification || !allowed.has(classification) || !note || note.length > 1000) return fail(400, { v2CorrectionError: 'Use a retained UUID, supported classification, and private evidence of 1–1,000 characters.' });
		const { error: correctionError } = await createSupabaseAdminClient().rpc('analytics_record_event_v2_classification', { p_event_id:eventId, p_classification:classification, p_note:note, p_corrected_by:user.id, p_reverse:false });
		if (correctionError) return fail(503, { v2CorrectionError: 'The v2 correction was not recorded. Nothing changed.' });
		return { v2Corrected:true };
	},
	undoV2Classification: async ({ cookies, request }) => {
		const user = await requireOperator(cookies);
		const eventId = (await request.formData()).get('eventId')?.toString();
		if (!eventId || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(eventId)) return fail(400, { v2CorrectionError: 'A valid retained UUID is required.' });
		const { error: undoError } = await createSupabaseAdminClient().rpc('analytics_record_event_v2_classification', { p_event_id:eventId, p_classification:'unclassified', p_note:'Reversal requested by the operator.', p_corrected_by:user.id, p_reverse:true });
		if (undoError) return fail(503, { v2CorrectionError: 'The v2 reversal was not recorded. Nothing changed.' });
		return { v2CorrectionUndone:true };
	}
};
