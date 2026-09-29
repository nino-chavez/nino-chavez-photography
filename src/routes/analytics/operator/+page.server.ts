import { error, fail, redirect } from '@sveltejs/kit';
import { base } from '$app/paths';
import { createSupabaseAdminClient, createSupabaseServerClient } from '$lib/supabase/server-ssr';
import { isAllowedAdmin } from '$lib/server/admin-auth';
import { buildOperatorReport } from '$lib/analytics/operator-report.server';
import { parseReportQuery, chicagoDayStart } from '$lib/analytics/report-contract';
import type { Actions, PageServerLoad } from './$types';


type CatalogueEntry = {album_key:string;album_name:string;photo_count:number};
type AlbumSetting = {album_key:string;visibility:string|null;published_at:string|null};
type AlbumFact = {album_key:string;sport:string|null;event_date:string|null;event_type?:string|null};
type CategoryFact = {photo_id:string;album_key:string;photo_category:string|null};
async function readAll<T>(page:(from:number)=>PromiseLike<{data:T[]|null;error:unknown}>) {
 const data:T[]=[];
 for(let from=0;;from+=1000){const result=await page(from);if(result.error)return {data:[] as T[],error:result.error};data.push(...(result.data??[]));if((result.data??[]).length<1000)return {data,error:null};}
}

function validDate(value: string | undefined): value is string {
	return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T12:00:00Z`).getTime()) && new Date(`${value}T12:00:00Z`).toISOString().slice(0,10)===value;
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
	const admin = createSupabaseAdminClient();
 const eventPage=Math.max(0,Math.min(10000,Number.parseInt(url.searchParams.get('event_page')??'0',10)||0));
 const dayAfter=new Date(`${query.end}T12:00:00Z`);dayAfter.setUTCDate(dayAfter.getUTCDate()+1);
 let retainedQuery=admin.from('engagement_events').select('id, album_key, photo_id, event_type, source, created_at, traffic_context').gte('created_at',chicagoDayStart(query.start)).lt('created_at',chicagoDayStart(dayAfter.toISOString().slice(0,10))).order('created_at',{ascending:false}).order('id',{ascending:false});
 let noteQuery=admin.from('analytics_sharing_annotations').select('id, album_key, activity_date, channel, note, updated_at').eq('created_by',user?.id ?? '').gte('activity_date',query.start).lte('activity_date',query.end).order('activity_date',{ascending:false});
 if(query.scope!=='all'){retainedQuery=retainedQuery.in('album_key',query.albumKeys);noteQuery=noteQuery.in('album_key',query.albumKeys);}
	const [report, saved, annotations, albumCatalogue, albumSettings, albumFacets, categoryFacets, correctionLog, retainedEvents] = await Promise.all([
		buildOperatorReport(admin, query, { publicOnly: !user }),
		user ? admin.from('analytics_saved_reports').select('id, name, query, updated_at').eq('owner_id', user.id).order('updated_at', { ascending: false }) : { data: [], error: null },
		user ? readAll(from=>noteQuery.range(from,from+999)) : { data: [], error: null }
		,
		readAll<CatalogueEntry>(from=>admin.from('albums_summary').select('album_key, album_name, photo_count').order('album_key').range(from,from+999)),
		readAll<AlbumSetting>(from=>admin.from('album_settings').select('album_key, visibility, published_at').order('album_key').range(from,from+999)),
		readAll<AlbumFact>(from=>admin.from('albums').select('album_key, sport, event_date').order('album_key').range(from,from+999)),
		readAll<CategoryFact>(from=>admin.from('photo_metadata').select('photo_id, album_key, photo_category').order('photo_id').range(from,from+999)),
		user ? admin.from('engagement_classification_corrections').select('id, engagement_event_id, classification, reason_flags, classification_version, note, corrected_at').order('corrected_at', { ascending: false }).limit(30) : { data: [], error: null },
		user ? retainedQuery.range(eventPage*50,eventPage*50+50) : { data: [], error: null }
	]);
	if (!user && albumSettings.error) throw error(503, 'Album visibility could not be verified.');
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
		published_at: settingsByAlbum.get(album.album_key)?.published_at ?? null
	})).sort((a,b)=>a.album_name.localeCompare(b.album_name));
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
		report,
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
		retainedEventsAvailable: !retainedEvents.error
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
	}
};
