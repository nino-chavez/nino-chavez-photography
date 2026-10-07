import type { SupabaseClient } from '@supabase/supabase-js';
import { launchScope, type Finding } from './intelligence-contract';
import { loadPublicFindings } from './intelligence-public.server';
import { fetchLaunchReadModel, type LaunchReadModel } from './launch-read-model.server';
import { buildRecap, type ArrivalRow } from './launch-recap';
import { dueRecaps, isRecapCheckpoint, MAX_RECAPS_PER_RUN, recapKey, RECAP_TIME_ZONE, type RecapCheckpoint, type RecapLaunch, type RecapSlot } from './launch-recap-schedule';
import { buildRecapDocument, buildUnavailableRecapDocument, type RecapDocument, type RecapEvidence } from './launch-recap-text';
import { buildOperatorReport } from './operator-report.server';
import { parseReportQuery, type ReportQuery } from './report-contract';
import { ANALYTICS_HOST, albumReportPath } from './report-paths';

/**
 * Launch recaps, the server half. Three jobs, kept apart:
 *
 *  - the reads a recap is built from, shared by the album report page and the scheduler, so the page and the stored
 *    text cannot disagree about where a number comes from;
 *  - generation: for each due, not-yet-stored recap, read as of its due instant, write the text, store one row per
 *    owner and a delivery record per channel;
 *  - the reads that show stored recaps (the album report's list, Home's "Next").
 *
 * Storage is the existing `analytics_intelligence_briefs` table with kind `launch_recap`. A brief belongs to an owner,
 * so a recap is stored for each owner who has chosen how long private records are kept and has the dashboard on, the
 * same gate the incident briefs use. The key `launch:<albumKey>:day<N>` sits in `incident_key` behind a unique index,
 * so a retry, an overlapping run or a changed UTC offset cannot store a second one.
 */

/** The window every report on the album page covers: the launch's first two weeks, as the read model returns them. */
export const LAUNCH_DAYS = 14;
export const RECAP_KIND = 'launch_recap';
const PHOTO_LIMIT = 2000;
const UNIQUE_VIOLATION = '23505';

type Admin = SupabaseClient;

/* ---------------------------------------------------------------------------------------------- */
/* The reads a recap is built from                                                                  */
/* ---------------------------------------------------------------------------------------------- */

export async function readPhotoRows(admin: Admin, albumKey: string) {
	// Photos with no sharpness are unprocessed and are never listed, here or in the gallery.
	const rows: Array<{ photoId: string; cfImageId: string | null }> = [];
	for (let from = 0; from < 5000; from += 1000) {
		const { data, error: readError } = await admin
			.from('photo_metadata')
			.select('photo_id, cf_image_id')
			.eq('album_key', albumKey)
			.not('sharpness', 'is', null)
			.order('photo_id')
			.range(from, from + 999);
		if (readError) throw readError;
		rows.push(...(data ?? []).map((row) => ({ photoId: String(row.photo_id), cfImageId: typeof row.cf_image_id === 'string' && row.cf_image_id ? row.cf_image_id : null })));
		if ((data ?? []).length < 1000) break;
	}
	return rows;
}

/** The report query behind the CSV export, assistant and arrivals: this album over the days its numbers cover. */
export function albumQuery(model: LaunchReadModel): ReportQuery {
	const album = model.album;
	const params = new URLSearchParams({ period: 'custom', scope: 'album', albums: album.albumKey, measure: 'photo_opens', traffic: 'conservative', compare: 'none' });
	const first = album.series[0]?.date;
	const last = album.series.at(-1)?.date;
	if (first && last) {
		params.set('start', first);
		params.set('end', last);
	}
	return parseReportQuery(params);
}

/**
 * Tagged arrivals are not part of the launch read model. They come from the report the operator page uses.
 * `read` is false only when the read failed; an album with no complete day has nothing to read and reports true.
 */
export async function readArrivals(admin: Admin, model: LaunchReadModel): Promise<{ arrivals: ArrivalRow[] | null; read: boolean }> {
	if (model.album.series.length === 0) return { arrivals: null, read: true };
	try {
		const report = await buildOperatorReport(admin, albumQuery(model), {
			publicOnly: true, photoWindow: { page: 0, pageSize: 0, rank: 'popular' }, includeDiagnostics: false, includeVisitorEstimate: false, includeToday: false, cacheRole: 'service_role'
		});
		return report.available ? { arrivals: report.sources.arrivals, read: true } : { arrivals: null, read: false };
	} catch (cause) {
		console.error('[launch recap] arrivals unavailable:', cause instanceof Error ? cause.message : cause);
		return { arrivals: null, read: false };
	}
}

/** The launch's current visible findings. "No snapshot yet" is the ordinary state of a new launch, not a failed read. */
export async function readLaunchFindings(admin: Admin, albumKey: string, now: Date): Promise<{ findings: Finding[]; read: boolean }> {
	try {
		const report = await loadPublicFindings(admin, launchScope(albumKey), now);
		return { findings: report.findings.filter((finding) => finding.target.albumKey === albumKey), read: true };
	} catch (cause) {
		const message = cause instanceof Error ? cause.message : String(cause);
		if (message === 'intelligence report unavailable') return { findings: [], read: true };
		console.error('[launch recap] findings unavailable:', message);
		return { findings: [], read: false };
	}
}

/** Where the full report lives, as an email or a copied link would give it. */
export function recapLink(albumKey: string, checkpoint: RecapCheckpoint): string {
	return `https://${ANALYTICS_HOST}${albumReportPath(ANALYTICS_HOST, albumKey, `?recap=${checkpoint}`)}`;
}

/* ---------------------------------------------------------------------------------------------- */
/* Owners and what they allow                                                                        */
/* ---------------------------------------------------------------------------------------------- */

export interface RecapOwner {
	ownerId: string;
	/** A verified, enabled email destination, or null. Without it only the dashboard record is written. */
	email: { address: string; verifiedAt: string; sender: 'owned' | 'posthog_native' } | null;
}

const SENDERS = ['owned', 'posthog_native'] as const;

/** Owners whose recaps are stored: retention chosen and the dashboard on. The email part follows the delivery path's own rule. */
export async function readRecapOwners(admin: Admin): Promise<RecapOwner[]> {
	const { data, error } = await admin.from('analytics_intelligence_preferences')
		.select('owner_id, external_enabled, destination_verified, destination_verified_at, destination, sender')
		.neq('retention_policy', 'undecided').eq('dashboard_enabled', true);
	if (error) throw new Error('recap owners unavailable');
	return (data ?? []).flatMap((row): RecapOwner[] => {
		if (typeof row.owner_id !== 'string') return [];
		const verified = row.external_enabled === true && row.destination_verified === true && typeof row.destination_verified_at === 'string'
			&& typeof row.destination === 'string' && row.destination.length > 0 && SENDERS.includes(row.sender as (typeof SENDERS)[number]);
		return [{ ownerId: row.owner_id, email: verified ? { address: String(row.destination), verifiedAt: String(row.destination_verified_at), sender: row.sender as 'owned' | 'posthog_native' } : null }];
	});
}

/* ---------------------------------------------------------------------------------------------- */
/* Generation                                                                                        */
/* ---------------------------------------------------------------------------------------------- */

/** `incomplete`: the launch's own records for the covered days are not all complete yet, found before any other read. */
/** `skipped`: the album is unlisted now, so no recap is written for anyone. */
export type BuiltRecap = { state: 'built'; document: RecapDocument } | { state: 'unread' } | { state: 'incomplete' } | { state: 'skipped' };

/** The four reads behind one recap. Injectable so the words can be tested without a database. */
export interface SlotReads {
	/** False when the album is unlisted. The launch read returns an unlisted album when asked for it by key, so the check is here. */
	visible(albumKey: string): Promise<boolean>;
	model(slot: RecapSlot): Promise<LaunchReadModel>;
	photoRows(albumKey: string): Promise<Array<{ photoId: string }>>;
	arrivals(model: LaunchReadModel): Promise<{ arrivals: ArrivalRow[] | null; read: boolean }>;
	findings(albumKey: string, now: Date): Promise<{ findings: Finding[]; read: boolean }>;
}

export function slotReads(admin: Admin): SlotReads {
	return {
		async visible(albumKey) {
			const { data, error } = await admin.from('album_settings').select('visibility').eq('album_key', albumKey).maybeSingle();
			if (error) throw new Error('album visibility unavailable');
			return data?.visibility !== 'unlisted';
		},
		// As of the due instant, so day N is the first N complete days however late this run is.
		model: (slot) => fetchLaunchReadModel(admin, { albumKey: slot.albumKey, asOf: slot.dueAt, days: LAUNCH_DAYS, traffic: 'conservative', publicOnly: true, photoLimit: PHOTO_LIMIT }),
		photoRows: (albumKey) => readPhotoRows(admin, albumKey),
		arrivals: (model) => readArrivals(admin, model),
		findings: (albumKey, now) => readLaunchFindings(admin, albumKey, now)
	};
}

/** Reads and writes the words for one slot, as of its due instant. A read that fails is `unread`, never a zero. */
export async function buildSlotDocument(reads: SlotReads, slot: RecapSlot, now: Date): Promise<BuiltRecap> {
	let model: LaunchReadModel;
	let photoRows: Array<{ photoId: string }>;
	try {
		if (!(await reads.visible(slot.albumKey))) return { state: 'skipped' };
		model = await reads.model(slot);
		photoRows = await reads.photoRows(slot.albumKey);
	} catch (cause) {
		console.error('[launch recap] launch numbers unavailable:', cause instanceof Error ? cause.message : cause);
		return { state: 'unread' };
	}
	if (model.album.status === 'no_launch_date') return { state: 'unread' };
	// While records may still be arriving, stop at the cheap read: the other reads would only be repeated next minute.
	if (now.getTime() < Date.parse(slot.settleBy) && !(slot.checkpoint === 3 ? model.album.totals.day3 : model.album.totals.day7).complete) return { state: 'incomplete' };
	const [{ arrivals, read: arrivalsRead }, { findings, read: findingsRead }] = await Promise.all([reads.arrivals(model), reads.findings(slot.albumKey, now)]);
	const recap = buildRecap({ model, arrivals, photoIds: new Set(photoRows.map((row) => row.photoId)), stored: true });
	return { state: 'built', document: buildRecapDocument({ slot, recap, model, findings, findingsRead, arrivalsRead, link: recapLink(slot.albumKey, slot.checkpoint) }) };
}

type StoreOutcome = 'stored' | 'exists';

/** What one recap row records about itself beyond the brief columns, kept in the row's `source_windows`. */
interface RecapMeta {
	albumKey: string;
	albumName: string | null;
	checkpoint: RecapCheckpoint;
	dueAt: string;
	subject: string;
	evidence: RecapEvidence;
	missing: string[];
	findingIds: string[];
}

/**
 * One owner's recap: the brief row, then its delivery records. The brief insert is the idempotency gate: a unique key
 * violation means the recap is already stored, and nothing else is written. The email record is written only when the
 * owner has a verified destination, and it is `pending` only when the recap is complete.
 */
export async function storeRecap(admin: Admin, owner: RecapOwner, slot: RecapSlot, document: RecapDocument, now: Date): Promise<StoreOutcome> {
	const meta: RecapMeta = { albumKey: slot.albumKey, albumName: slot.albumName, checkpoint: slot.checkpoint, dueAt: slot.dueAt, subject: document.subject, evidence: document.evidence, missing: document.missing, findingIds: document.findingIds };
	const inserted = await admin.from('analytics_intelligence_briefs').insert({
		owner_id: owner.ownerId, scope_key: null, snapshot_id: null, period_key: slot.dueDate, kind: RECAP_KIND, late: slot.late,
		incident_key: slot.key, body: document.body, findings: [], snapshot_ids: [],
		source_windows: [{ scope: launchScope(slot.albumKey), cutoff: slot.dueAt, timezone: RECAP_TIME_ZONE, current: document.window, previous: null, recap: meta }],
		suppressions: []
	}).select('id').single();
	if (inserted.error) {
		if (inserted.error.code === UNIQUE_VIOLATION) return 'exists';
		throw new Error(`recap brief was not stored (${inserted.error.code ?? 'unknown'})`);
	}
	const briefId = String(inserted.data.id);
	const payload = { subject: document.subject, body: document.body };
	const dashboard = await admin.from('analytics_intelligence_deliveries').insert({
		brief_id: briefId, channel: 'dashboard', sender: 'owned', destination_verified: false, preference_enabled: true, idempotency_key: `dashboard:${briefId}`, payload
	});
	if (dashboard.error && dashboard.error.code !== UNIQUE_VIOLATION) throw new Error('recap delivery record was not stored');
	if (owner.email) {
		const email = await admin.from('analytics_intelligence_deliveries').insert({
			brief_id: briefId, channel: 'email', sender: owner.email.sender, destination_verified: true, preference_enabled: true, idempotency_key: `email:${briefId}`, payload,
			destination: { channel: 'email', address: owner.email.address, verifiedAt: owner.email.verifiedAt },
			status: document.complete ? 'pending' : 'suppressed', error_code: document.complete ? null : 'recap_not_complete',
			available_at: now.toISOString()
		});
		if (email.error && email.error.code !== UNIQUE_VIOLATION) throw new Error('recap email record was not stored');
	}
	return 'stored';
}

export interface RecapRunResult {
	/** Owners the recaps are stored for. Zero means nothing is stored, and the reads are skipped. */
	owners: number;
	due: number;
	stored: number;
	/** Written earlier, found again by the unique key. */
	existing: number;
	/** Waiting for records or for a read that failed, still inside the settling period. */
	waiting: number;
	/** Stored saying the numbers could not be read, after the settling period. */
	unavailable: number;
	/** The album is unlisted now: nothing is written for it. */
	skipped: number;
	failed: number;
}

export interface RecapRunDeps {
	owners(): Promise<RecapOwner[]>;
	/** `${ownerId}|${key}` of every recap already stored for these keys. */
	existing(keys: readonly string[]): Promise<Set<string>>;
	build(slot: RecapSlot, now: Date): Promise<BuiltRecap>;
	store(owner: RecapOwner, slot: RecapSlot, document: RecapDocument, now: Date): Promise<StoreOutcome>;
}

export function recapRunDeps(admin: Admin): RecapRunDeps {
	return {
		owners: () => readRecapOwners(admin),
		async existing(keys) {
			const { data, error } = await admin.from('analytics_intelligence_briefs').select('owner_id, incident_key').eq('kind', RECAP_KIND).in('incident_key', [...keys]);
			if (error) throw new Error('stored recaps unavailable');
			return new Set((data ?? []).map((row) => `${row.owner_id}|${row.incident_key}`));
		},
		build: (slot, now) => buildSlotDocument(slotReads(admin), slot, now),
		store: (owner, slot, document, now) => storeRecap(admin, owner, slot, document, now)
	};
}

/**
 * One scheduler wake-up. For each recap that is due and not yet stored (at most MAX_RECAPS_PER_RUN, oldest first):
 * read it as of its due instant; if its records are not all complete, wait until the settling period ends, then store
 * it saying so; store it for every owner. Nothing here throws: a failure is counted and the next wake-up tries again,
 * until the checkpoint lapses.
 */
export async function runRecapGeneration(deps: RecapRunDeps, launches: readonly RecapLaunch[], now: Date): Promise<RecapRunResult> {
	const result: RecapRunResult = { owners: 0, due: 0, stored: 0, existing: 0, waiting: 0, unavailable: 0, skipped: 0, failed: 0 };
	const slots = dueRecaps(launches, now);
	result.due = slots.length;
	if (!slots.length) return result;
	let owners: RecapOwner[];
	let existing: Set<string>;
	try {
		owners = await deps.owners();
		result.owners = owners.length;
		// With nobody to store a recap for, no launch number is read. The settings page says so.
		if (!owners.length) return result;
		existing = await deps.existing(slots.map((slot) => slot.key));
	} catch (cause) {
		console.error('[launch recap] could not check what is stored:', cause instanceof Error ? cause.message : cause);
		result.failed += 1;
		return result;
	}
	let worked = 0;
	for (const slot of slots) {
		const missingFor = owners.filter((owner) => !existing.has(`${owner.ownerId}|${slot.key}`));
		if (!missingFor.length) { result.existing += 1; continue; }
		if (worked >= MAX_RECAPS_PER_RUN) break;
		worked += 1;
		try {
			const built = await deps.build(slot, now);
			if (built.state === 'skipped') { result.skipped += 1; continue; }
			const settling = now.getTime() < Date.parse(slot.settleBy);
			let document: RecapDocument | null = null;
			if (built.state === 'built') document = built.document;
			// Records still arriving, or a read that failed: wait, do not write a partial total early.
			if ((built.state !== 'built' || !document?.complete) && settling) { result.waiting += 1; continue; }
			if (!document) {
				document = buildUnavailableRecapDocument({ albumKey: slot.albumKey, albumName: slot.albumName, checkpoint: slot.checkpoint, dueAt: slot.dueAt, late: slot.late }, recapLink(slot.albumKey, slot.checkpoint));
				result.unavailable += 1;
			}
			for (const owner of missingFor) {
				const outcome = await deps.store(owner, slot, document, now);
				if (outcome === 'stored') result.stored += 1; else result.existing += 1;
			}
		} catch (cause) {
			console.error('[launch recap] a recap was not stored:', cause instanceof Error ? cause.message : cause);
			result.failed += 1;
			// The migration that adds the kind is not applied: every attempt would fail the same way.
			if (cause instanceof Error && /\(23514\)/.test(cause.message)) break;
		}
	}
	return result;
}

/* ---------------------------------------------------------------------------------------------- */
/* Showing what is stored                                                                            */
/* ---------------------------------------------------------------------------------------------- */

export interface StoredRecap {
	checkpoint: RecapCheckpoint;
	key: string;
	/** The Chicago date it was due. */
	dueDate: string;
	/** The instant it was due. */
	dueAt: string;
	late: boolean;
	createdAt: string;
	subject: string;
	evidence: RecapEvidence;
	missing: string[];
	/** The Chicago days its figures cover, or null when it states none. */
	window: { start: string; end: string } | null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
function decodeWindow(value: unknown): { start: string; end: string } | null {
	const row = object(value);
	return row && typeof row.start === 'string' && typeof row.end === 'string' && DATE.test(row.start) && DATE.test(row.end) && row.start <= row.end ? { start: row.start, end: row.end } : null;
}

const EVIDENCE: readonly RecapEvidence[] = ['complete', 'partial', 'unavailable'];
const object = (value: unknown): Record<string, unknown> | null => (value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null);

export function decodeStoredRecap(row: Record<string, unknown>): (StoredRecap & { body: string | null }) | null {
	const windows = Array.isArray(row.source_windows) ? row.source_windows : [];
	const meta = object(object(windows[0])?.recap);
	if (!meta || !isRecapCheckpoint(meta.checkpoint) || typeof meta.albumKey !== 'string' || typeof row.incident_key !== 'string') return null;
	if (row.incident_key !== recapKey(meta.albumKey, meta.checkpoint)) return null;
	if (typeof meta.dueAt !== 'string' || Number.isNaN(Date.parse(meta.dueAt)) || typeof row.period_key !== 'string' || typeof row.created_at !== 'string') return null;
	return {
		checkpoint: meta.checkpoint, key: row.incident_key, dueDate: row.period_key, dueAt: meta.dueAt, late: row.late === true, createdAt: row.created_at,
		subject: typeof meta.subject === 'string' ? meta.subject : '',
		evidence: EVIDENCE.includes(meta.evidence as RecapEvidence) ? meta.evidence as RecapEvidence : 'partial',
		missing: Array.isArray(meta.missing) ? meta.missing.filter((item): item is string => typeof item === 'string').slice(0, 5) : [],
		window: decodeWindow(object(windows[0])?.current),
		body: typeof row.body === 'string' ? row.body : null
	};
}

function earliestPerKey<T extends { key: string; createdAt: string }>(rows: T[]): T[] {
	const byKey = new Map<string, T>();
	for (const row of rows) {
		const kept = byKey.get(row.key);
		if (!kept || Date.parse(row.createdAt) < Date.parse(kept.createdAt)) byKey.set(row.key, row);
	}
	return [...byKey.values()];
}

/** The stored recaps of one album, day 3 first. Null when they could not be read, which is never "none stored". */
export async function readStoredRecaps(admin: Admin, albumKey: string): Promise<StoredRecap[] | null> {
	const { data, error } = await admin.from('analytics_intelligence_briefs')
		.select('period_key, late, created_at, incident_key, source_windows')
		.eq('kind', RECAP_KIND).in('incident_key', [recapKey(albumKey, 3), recapKey(albumKey, 7)]);
	if (error) { console.error('[launch recap] stored recaps unavailable:', error.message); return null; }
	const decoded = (data ?? []).flatMap((row) => { const one = decodeStoredRecap(row as Record<string, unknown>); return one ? [one] : []; });
	return earliestPerKey(decoded).map(({ body: _body, ...recap }) => recap).sort((x, y) => x.checkpoint - y.checkpoint);
}

/** One stored recap with its text. Null when it is not stored or could not be read. */
export async function readStoredRecap(admin: Admin, albumKey: string, checkpoint: RecapCheckpoint): Promise<(StoredRecap & { body: string }) | null> {
	const { data, error } = await admin.from('analytics_intelligence_briefs')
		.select('period_key, late, created_at, incident_key, body, source_windows')
		.eq('kind', RECAP_KIND).eq('incident_key', recapKey(albumKey, checkpoint)).order('created_at', { ascending: true }).limit(1);
	if (error) { console.error('[launch recap] stored recap unavailable:', error.message); return null; }
	const decoded = decodeStoredRecap((data?.[0] ?? {}) as Record<string, unknown>);
	return decoded && decoded.body ? { ...decoded, body: decoded.body } : null;
}

export interface RecapStorage {
	/** Every recap key stored, for any owner. */
	keys: Set<string>;
	/** At least one owner is set up to have recaps stored: retention chosen and the dashboard on. */
	storing: boolean;
}

/** What Home and the album report need to say honestly whether a due recap exists. Null when either read failed. */
export async function readRecapStorage(admin: Admin): Promise<RecapStorage | null> {
	const [owners, briefs] = await Promise.all([
		admin.from('analytics_intelligence_preferences').select('owner_id', { count: 'exact', head: true }).neq('retention_policy', 'undecided').eq('dashboard_enabled', true),
		admin.from('analytics_intelligence_briefs').select('incident_key').eq('kind', RECAP_KIND).limit(500)
	]);
	if (owners.error || briefs.error) {
		console.error('[launch recap] storage state unavailable:', owners.error?.message ?? briefs.error?.message);
		return null;
	}
	return { keys: new Set((briefs.data ?? []).map((row) => String(row.incident_key))), storing: (owners.count ?? 0) > 0 };
}
