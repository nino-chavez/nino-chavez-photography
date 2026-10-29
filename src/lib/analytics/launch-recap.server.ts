import type { SupabaseClient } from '@supabase/supabase-js';
import { launchScope, type Finding } from './intelligence-contract';
import { loadPublicFindings } from './intelligence-public.server';
import { fetchLaunchReadModel, type LaunchReadModel } from './launch-read-model.server';
import { buildRecap, type ArrivalRow } from './launch-recap';
import { dueRecaps, isRecapCheckpoint, MAX_RECAPS_PER_RUN, recapKey, type RecapCheckpoint, type RecapLaunch, type RecapSlot } from './launch-recap-schedule';
import { buildRecapDocument, buildUnavailableRecapDocument, type RecapDocument, type RecapEvidence } from './launch-recap-text';
import { buildOperatorReport } from './operator-report.server';
import { parseReportQuery, type ReportQuery } from './report-contract';
import { ANALYTICS_HOST, albumReportPath } from './report-paths';

/**
 * Launch recaps, the server half. Three jobs, kept apart:
 *
 *  - the reads a recap is built from, shared by the album report page, the scheduler and the backfill script, so the
 *    page and the stored text cannot disagree about where a number comes from;
 *  - generation: for each due recap that is not yet stored, read it as of its due instant, write the text and store it;
 *  - the reads that show stored recaps on the album report.
 *
 * A recap is public and launch-scoped: one row per album and checkpoint in `analytics_launch_recaps`, no owner, outside
 * private retention and delete-history. It is written whether or not any owner exists. Only email is owner-gated: for an
 * owner with a verified destination the recap is also queued as a private per-owner brief (the message that was queued),
 * which the existing delivery claim path serves, re-checking the owner's opt-out at claim time. See the migration header.
 */

/** The window every report on the album page covers: the launch's first two weeks, as the read model returns them. */
export const LAUNCH_DAYS = 14;
export const RECAP_TABLE = 'analytics_launch_recaps';
export const RECAP_EMAIL_KIND = 'launch_recap';
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
 * Tagged arrivals are not part of the launch read model. They come from the scheduled gallery report.
 * `read` is false only when the read failed; an album with no complete day has nothing to read and reports true.
 */
export async function readArrivals(admin: Admin, model: LaunchReadModel): Promise<{ arrivals: ArrivalRow[] | null; read: boolean; traffic: Array<{ classification: string; count: number }> | null }> {
	if (model.album.series.length === 0) return { arrivals: null, read: true, traffic: null };
	try {
		const report = await buildOperatorReport(admin, albumQuery(model), {
			publicOnly: true, photoWindow: { page: 0, pageSize: 0, rank: 'popular' }, includeDiagnostics: false, includeVisitorEstimate: false, includeToday: false, cacheRole: 'service_role'
		});
		// The same read says how this album's counted photo opens were sorted, so the page can say how much of its total is unsorted.
		return report.available ? { arrivals: report.sources.arrivals, read: true, traffic: report.traffic } : { arrivals: null, read: false, traffic: null };
	} catch (cause) {
		console.error('[launch recap] arrivals unavailable:', cause instanceof Error ? cause.message : cause);
		return { arrivals: null, read: false, traffic: null };
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
/* Building one recap                                                                                */
/* ---------------------------------------------------------------------------------------------- */

/** The reads behind one recap. Injectable so the words can be tested without a database. */
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

/** `incomplete`: the launch's own records for the covered days are not all complete yet, found before any other read. */
export type BuiltRecap = { state: 'built'; document: RecapDocument } | { state: 'unread' } | { state: 'incomplete' } | { state: 'skipped' };

/**
 * Reads and writes the words for one slot, as of its due instant. A read that fails is `unread`, never a zero.
 * `writtenOn` (a Chicago date) marks a backfill: the text says it was written later, from the records for those days.
 */
export async function buildSlotDocument(reads: SlotReads, slot: RecapSlot, now: Date, options: { writtenOn?: string } = {}): Promise<BuiltRecap> {
	let model: LaunchReadModel;
	try {
		if (!(await reads.visible(slot.albumKey))) return { state: 'skipped' };
		model = await reads.model(slot);
	} catch (cause) {
		console.error('[launch recap] launch numbers unavailable:', cause instanceof Error ? cause.message : cause);
		return { state: 'unread' };
	}
	if (model.album.status === 'no_launch_date') return { state: 'unread' };
	// While records may still be arriving, stop at the cheap read: the other reads would only be repeated next minute.
	if (now.getTime() < Date.parse(slot.settleBy) && !(slot.checkpoint === 3 ? model.album.totals.day3 : model.album.totals.day7).complete) return { state: 'incomplete' };
	let photoRows: Array<{ photoId: string }>;
	try {
		photoRows = await reads.photoRows(slot.albumKey);
	} catch (cause) {
		console.error('[launch recap] photos unavailable:', cause instanceof Error ? cause.message : cause);
		return { state: 'unread' };
	}
	const [{ arrivals, read: arrivalsRead }, { findings, read: findingsRead }] = await Promise.all([reads.arrivals(model), reads.findings(slot.albumKey, now)]);
	const recap = buildRecap({ model, arrivals, photoIds: new Set(photoRows.map((row) => row.photoId)), stored: true });
	const document = buildRecapDocument({
		slot: options.writtenOn ? { ...slot, late: false } : slot, recap, model, findings, findingsRead, arrivalsRead, link: recapLink(slot.albumKey, slot.checkpoint), writtenOn: options.writtenOn
	});
	return { state: 'built', document };
}

/* ---------------------------------------------------------------------------------------------- */
/* Storing                                                                                           */
/* ---------------------------------------------------------------------------------------------- */

export type RecapSource = 'scheduled' | 'backfill';
type StoreOutcome = 'stored' | 'exists';

/** The one public row for an album and checkpoint. A unique violation means it is already there, so nothing else is written. */
export async function storeRecap(admin: Admin, slot: RecapSlot, document: RecapDocument, source: RecapSource): Promise<StoreOutcome> {
	const { error } = await admin.from(RECAP_TABLE).insert({
		album_key: slot.albumKey, checkpoint: slot.checkpoint, due_date: slot.dueDate, due_at: slot.dueAt, late: source === 'scheduled' && slot.late, source,
		evidence: document.evidence, missing: document.missing, covers_start: document.window?.start ?? null, covers_end: document.window?.end ?? null,
		subject: document.subject, body: document.body, finding_ids: document.findingIds
	});
	if (error) {
		if (error.code === UNIQUE_VIOLATION) return 'exists';
		throw new Error(`recap was not stored (${error.code ?? 'unknown'})`);
	}
	return 'stored';
}

export interface EmailOwner {
	ownerId: string;
	address: string;
	verifiedAt: string;
	sender: 'owned' | 'posthog_native';
}

const SENDERS = ['owned', 'posthog_native'] as const;

/**
 * Owners a recap may be emailed to: email on, a verified destination with its time, an allowed sender, and retention
 * chosen (the claim path requires it). The claim path checks every one of these again when it sends.
 */
export async function readEmailOwners(admin: Admin): Promise<EmailOwner[]> {
	const { data, error } = await admin.from('analytics_intelligence_preferences')
		.select('owner_id, destination_verified_at, destination, sender')
		.eq('external_enabled', true).eq('destination_verified', true).in('retention_policy', ['days', 'until_deleted']);
	if (error) throw new Error('email owners unavailable');
	return (data ?? []).flatMap((row): EmailOwner[] => {
		if (typeof row.owner_id !== 'string' || typeof row.destination_verified_at !== 'string' || typeof row.destination !== 'string' || !row.destination || !SENDERS.includes(row.sender as (typeof SENDERS)[number])) return [];
		return [{ ownerId: row.owner_id, address: row.destination, verifiedAt: row.destination_verified_at, sender: row.sender as 'owned' | 'posthog_native' }];
	});
}

/**
 * Queue one owner's email for a recap: a private brief carrying the message, then its email delivery record, `pending`
 * only when the recap is complete and otherwise `suppressed` with its reason. The unique key on the brief means a retry
 * or an overlapping run cannot queue the same recap to the same owner twice.
 */
export async function queueRecapEmail(admin: Admin, owner: EmailOwner, slot: RecapSlot, document: RecapDocument, now: Date): Promise<'queued' | 'exists'> {
	const inserted = await admin.from('analytics_intelligence_briefs').insert({
		owner_id: owner.ownerId, scope_key: null, snapshot_id: null, period_key: slot.dueDate, kind: RECAP_EMAIL_KIND, late: slot.late,
		incident_key: slot.key, body: document.body, findings: [], snapshot_ids: [], source_windows: [], suppressions: []
	}).select('id').single();
	if (inserted.error) {
		if (inserted.error.code === UNIQUE_VIOLATION) return 'exists';
		throw new Error(`recap email was not queued (${inserted.error.code ?? 'unknown'})`);
	}
	const briefId = String(inserted.data.id);
	const email = await admin.from('analytics_intelligence_deliveries').insert({
		brief_id: briefId, channel: 'email', sender: owner.sender, destination_verified: true, preference_enabled: true, idempotency_key: `email:${briefId}`,
		payload: { subject: document.subject, body: document.body },
		destination: { channel: 'email', address: owner.address, verifiedAt: owner.verifiedAt },
		status: document.complete ? 'pending' : 'suppressed', error_code: document.complete ? null : 'recap_not_complete', available_at: now.toISOString()
	});
	if (email.error && email.error.code !== UNIQUE_VIOLATION) throw new Error('recap email record was not stored');
	return 'queued';
}

/* ---------------------------------------------------------------------------------------------- */
/* Generation                                                                                        */
/* ---------------------------------------------------------------------------------------------- */

export interface RecapRunResult {
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
	/** Recaps whose full set of reads ran. The scheduler skips its refresh jobs for a wake-up that did this one. */
	built: number;
	emailQueued: number;
}

export interface RecapRunDeps {
	/** The keys (`launch:<albumKey>:day<N>`) of every recap already stored for these slots. */
	existing(slots: readonly RecapSlot[]): Promise<Set<string>>;
	build(slot: RecapSlot, now: Date): Promise<BuiltRecap>;
	store(slot: RecapSlot, document: RecapDocument): Promise<StoreOutcome>;
	emailOwners(): Promise<EmailOwner[]>;
	queueEmail(owner: EmailOwner, slot: RecapSlot, document: RecapDocument, now: Date): Promise<'queued' | 'exists'>;
}

export function recapRunDeps(admin: Admin): RecapRunDeps {
	return {
		async existing(slots) {
			const keys = [...new Set(slots.map((slot) => slot.albumKey))];
			const { data, error } = await admin.from(RECAP_TABLE).select('album_key, checkpoint').in('album_key', keys);
			if (error) throw new Error('stored recaps unavailable');
			return new Set((data ?? []).flatMap((row) => (isRecapCheckpoint(row.checkpoint) ? [recapKey(String(row.album_key), row.checkpoint)] : [])));
		},
		build: (slot, now) => buildSlotDocument(slotReads(admin), slot, now),
		store: (slot, document) => storeRecap(admin, slot, document, 'scheduled'),
		emailOwners: () => readEmailOwners(admin),
		queueEmail: (owner, slot, document, now) => queueRecapEmail(admin, owner, slot, document, now)
	};
}

/**
 * One scheduler wake-up. For each recap that is due and not yet stored (at most MAX_RECAPS_PER_RUN, oldest first):
 * read it as of its due instant; if its records are not all complete, wait until the settling period ends, then store
 * it saying so; store it once; then queue its email for each owner who has a verified destination. Nothing here throws:
 * a failure is counted and the next wake-up tries again, until the checkpoint lapses.
 */
export async function runRecapGeneration(deps: RecapRunDeps, launches: readonly RecapLaunch[], now: Date): Promise<RecapRunResult> {
	const result: RecapRunResult = { due: 0, stored: 0, existing: 0, waiting: 0, unavailable: 0, skipped: 0, failed: 0, built: 0, emailQueued: 0 };
	const slots = dueRecaps(launches, now);
	result.due = slots.length;
	if (!slots.length) return result;
	let existing: Set<string>;
	try {
		existing = await deps.existing(slots);
	} catch (cause) {
		console.error('[launch recap] could not check what is stored:', cause instanceof Error ? cause.message : cause);
		result.failed += 1;
		return result;
	}
	let worked = 0;
	for (const slot of slots) {
		if (existing.has(slot.key)) { result.existing += 1; continue; }
		if (worked >= MAX_RECAPS_PER_RUN) break;
		worked += 1;
		try {
			const built = await deps.build(slot, now);
			if (built.state === 'skipped') { result.skipped += 1; continue; }
			if (built.state === 'built') result.built += 1;
			const settling = now.getTime() < Date.parse(slot.settleBy);
			let document: RecapDocument | null = built.state === 'built' ? built.document : null;
			// Records still arriving, or a read that failed: wait, do not write a partial total early.
			if ((built.state !== 'built' || !document?.complete) && settling) { result.waiting += 1; continue; }
			if (!document) {
				document = buildUnavailableRecapDocument({ albumKey: slot.albumKey, albumName: slot.albumName, checkpoint: slot.checkpoint, dueAt: slot.dueAt, late: slot.late }, recapLink(slot.albumKey, slot.checkpoint));
				result.unavailable += 1;
			}
			const outcome = await deps.store(slot, document);
			if (outcome === 'exists') { result.existing += 1; continue; }
			result.stored += 1;
			// The recap is public and stored. Its email is a separate, owner-gated step: a failure here never undoes it.
			try {
				for (const owner of await deps.emailOwners()) if ((await deps.queueEmail(owner, slot, document, now)) === 'queued') result.emailQueued += 1;
			} catch (cause) {
				console.error('[launch recap] email was not queued:', cause instanceof Error ? cause.message : cause);
				result.failed += 1;
			}
		} catch (cause) {
			console.error('[launch recap] a recap was not stored:', cause instanceof Error ? cause.message : cause);
			result.failed += 1;
			// The migration that creates the table is not applied: every attempt would fail the same way.
			if (cause instanceof Error && /\((42P01|PGRST205)\)/.test(cause.message)) break;
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
	source: RecapSource;
	createdAt: string;
	subject: string;
	evidence: RecapEvidence;
	missing: string[];
	/** The Chicago days its figures cover, or null when it states none. */
	window: { start: string; end: string } | null;
}

const EVIDENCE: readonly RecapEvidence[] = ['complete', 'partial', 'unavailable'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const INSTANT = (value: unknown): value is string => typeof value === 'string' && !Number.isNaN(Date.parse(value));

/** Decodes one `analytics_launch_recaps` row; anything that does not fit is dropped rather than shown. */
export function decodeStoredRecap(row: Record<string, unknown>): (StoredRecap & { body: string | null }) | null {
	if (typeof row.album_key !== 'string' || !isRecapCheckpoint(row.checkpoint)) return null;
	if (typeof row.due_date !== 'string' || !DATE.test(row.due_date) || !INSTANT(row.due_at) || !INSTANT(row.created_at) || typeof row.subject !== 'string') return null;
	const start = row.covers_start; const end = row.covers_end;
	const window = typeof start === 'string' && typeof end === 'string' && DATE.test(start) && DATE.test(end) && start <= end ? { start, end } : null;
	return {
		checkpoint: row.checkpoint, key: recapKey(row.album_key, row.checkpoint), dueDate: row.due_date, dueAt: new Date(row.due_at).toISOString(), late: row.late === true,
		source: row.source === 'backfill' ? 'backfill' : 'scheduled', createdAt: row.created_at, subject: row.subject,
		// An unknown evidence value is never read as complete.
		evidence: EVIDENCE.includes(row.evidence as RecapEvidence) ? row.evidence as RecapEvidence : 'partial',
		missing: Array.isArray(row.missing) ? row.missing.filter((item): item is string => typeof item === 'string').slice(0, 5) : [],
		window, body: typeof row.body === 'string' ? row.body : null
	};
}

const LIST_COLUMNS = 'album_key, checkpoint, due_date, due_at, late, source, created_at, evidence, missing, covers_start, covers_end, subject';

/** The stored recaps of one album, day 3 first. Null when they could not be read, which is never "none stored". */
export async function readStoredRecaps(admin: Admin, albumKey: string): Promise<StoredRecap[] | null> {
	const { data, error } = await admin.from(RECAP_TABLE).select(LIST_COLUMNS).eq('album_key', albumKey).in('checkpoint', [3, 7]);
	if (error) { console.error('[launch recap] stored recaps unavailable:', error.message); return null; }
	return (data ?? []).flatMap((row) => { const one = decodeStoredRecap(row as Record<string, unknown>); return one ? [(({ body: _body, ...recap }) => recap)(one)] : []; }).sort((x, y) => x.checkpoint - y.checkpoint);
}

/** One stored recap with its text. Null when it is not stored or could not be read. */
export async function readStoredRecap(admin: Admin, albumKey: string, checkpoint: RecapCheckpoint): Promise<(StoredRecap & { body: string }) | null> {
	const { data, error } = await admin.from(RECAP_TABLE).select(`${LIST_COLUMNS}, body`).eq('album_key', albumKey).eq('checkpoint', checkpoint).limit(1);
	if (error) { console.error('[launch recap] stored recap unavailable:', error.message); return null; }
	const decoded = decodeStoredRecap((data?.[0] ?? {}) as Record<string, unknown>);
	return decoded && decoded.body ? { ...decoded, body: decoded.body } : null;
}
