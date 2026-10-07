import type { SupabaseClient } from '@supabase/supabase-js';
import { fail } from '@sveltejs/kit';
import { chicagoDayStart } from './report-contract';
import { EVENT_PAGE_SIZE, HISTORY_LIMIT, legacyCorrection, legacyReversal, correctionKey, reversibleKeys, v2Correction, v2Reversal, type CorrectionsView } from './corrections';

/**
 * The reads and writes behind "correct how an event is classified", for the signed-in owner only. The caller
 * has already proved the owner; nothing here is reachable for anyone else.
 *
 * Retained events are read for the owner, unlisted albums included: the point is to correct the owner's own
 * test traffic, and a correction writes a new private version rather than changing the event. Each read
 * fails alone and says so; none turns into an empty list.
 */

interface LegacyEvent { id: number; album_key: string | null; photo_id: string | null; event_type: string; source: string | null; created_at: string; traffic_context: string }
interface V2Event { event_id: string; event_name: string; occurred_at: string; album_key: string | null; photo_id: string | null; traffic_context: string }

const addDay = (day: string) => {
	const next = new Date(`${day}T12:00:00Z`);
	next.setUTCDate(next.getUTCDate() + 1);
	return next.toISOString().slice(0, 10);
};
const words = (value: string) => value.replaceAll('_', ' ');

/** Retained events and correction history for the days a page covers, `page` 50 events at a time. */
export async function loadCorrections(admin: SupabaseClient, window: { start: string; end: string }, page: number, albumNames: Map<string, string>): Promise<CorrectionsView> {
	const from = chicagoDayStart(window.start);
	const to = chicagoDayStart(addDay(window.end));
	const rangeStart = page * EVENT_PAGE_SIZE;
	const [legacyEvents, legacyLog, v2Events, v2Log] = await Promise.all([
		admin.from('engagement_events').select('id, album_key, photo_id, event_type, source, created_at, traffic_context').gte('created_at', from).lt('created_at', to).order('created_at', { ascending: false }).order('id', { ascending: false }).range(rangeStart, rangeStart + EVENT_PAGE_SIZE),
		admin.from('engagement_classification_corrections').select('id, engagement_event_id, classification, classification_version, note, corrected_at').order('corrected_at', { ascending: false }).limit(HISTORY_LIMIT),
		admin.from('analytics_events_v2').select('event_id, event_name, occurred_at, album_key, photo_id, traffic_context').gte('occurred_at', from).lt('occurred_at', to).order('occurred_at', { ascending: false }).order('event_id', { ascending: false }).range(rangeStart, rangeStart + EVENT_PAGE_SIZE),
		admin.from('analytics_event_v2_classifications').select('event_id, classification, classification_version, note, corrected_at, reversed').order('corrected_at', { ascending: false }).limit(HISTORY_LIMIT)
	]);
	const albumOf = (key: string | null) => (key ? albumNames.get(key) ?? 'Album' : 'Gallery');
	const stamp = (value: string) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(value));

	// A correction made on an event outside this page is still shown with what the event was.
	const legacyById = new Map<number, LegacyEvent>(((legacyEvents.data ?? []) as LegacyEvent[]).map((event) => [Number(event.id), event]));
	const wanted = [...new Set(((legacyLog.data ?? []) as Array<{ engagement_event_id: number }>).map((row) => Number(row.engagement_event_id)))].filter((id) => !legacyById.has(id));
	let contextFailed = false;
	for (let start = 0; start < wanted.length; start += 100) {
		const read = await admin.from('engagement_events').select('id, album_key, photo_id, event_type, source, created_at, traffic_context').in('id', wanted.slice(start, start + 100));
		if (read.error) { contextFailed = true; continue; }
		for (const event of (read.data ?? []) as LegacyEvent[]) legacyById.set(Number(event.id), event);
	}

	const legacyRows = ((legacyLog.data ?? []) as Array<{ engagement_event_id: number; classification: string; classification_version: number; note: string; corrected_at: string }>).map((row) => {
		const event = legacyById.get(Number(row.engagement_event_id));
		return { eventId: String(row.engagement_event_id), version: Number(row.classification_version), classification: row.classification, note: row.note, correctedAt: row.corrected_at, reversed: false, context: event ? `${albumOf(event.album_key)} · ${words(event.event_type)} · ${stamp(event.created_at)}` : contextFailed ? 'Event context could not be read' : 'Retained event context unavailable' };
	});
	const v2Rows = ((v2Log.data ?? []) as Array<{ event_id: string; classification: string; classification_version: number; note: string; corrected_at: string; reversed: boolean }>).map((row) => ({
		eventId: row.event_id, version: Number(row.classification_version), classification: row.classification, note: row.note, correctedAt: row.corrected_at, reversed: !!row.reversed, context: row.event_id
	}));
	const legacyOpen = reversibleKeys(legacyRows);
	const v2Open = reversibleKeys(v2Rows);

	const legacyList = ((legacyEvents.data ?? []) as LegacyEvent[]);
	const v2List = ((v2Events.data ?? []) as V2Event[]);
	return {
		page,
		hasMore: legacyList.length > EVENT_PAGE_SIZE || v2List.length > EVENT_PAGE_SIZE,
		legacy: {
			events: legacyList.slice(0, EVENT_PAGE_SIZE).map((event) => ({ id: String(event.id), album: albumOf(event.album_key), what: words(event.event_type), at: stamp(event.created_at), source: event.source })),
			eventsAvailable: !legacyEvents.error,
			log: legacyRows.map((row) => ({ ...row, canReverse: legacyOpen.has(correctionKey(row)) })),
			logAvailable: !legacyLog.error
		},
		v2: {
			events: v2List.slice(0, EVENT_PAGE_SIZE).map((event) => ({ id: event.event_id, album: albumOf(event.album_key), what: words(event.event_name), at: stamp(event.occurred_at), source: null })),
			eventsAvailable: !v2Events.error,
			log: v2Rows.map((row) => ({ ...row, canReverse: v2Open.has(correctionKey(row)) })),
			logAvailable: !v2Log.error
		}
	};
}

/** The four writes. Each returns what the page shows next; a refused or failed write says nothing changed. */
export async function recordCorrection(admin: SupabaseClient, ownerId: string, kind: 'legacy' | 'v2', form: FormData) {
	if (kind === 'legacy') {
		const parsed = legacyCorrection(form);
		if (!parsed.ok) return fail(400, { correctionError: parsed.error });
		const { error } = await admin.rpc('analytics_record_classification_correction', { p_event_id: parsed.eventId, p_classification: parsed.classification, p_note: parsed.note, p_corrected_by: ownerId, p_reverse: false });
		return error ? fail(503, { correctionError: 'The correction was not recorded. Nothing changed.' }) : { corrected: true as const };
	}
	const parsed = v2Correction(form);
	if (!parsed.ok) return fail(400, { v2CorrectionError: parsed.error });
	const { error } = await admin.rpc('analytics_record_event_v2_classification', { p_event_id: parsed.eventId, p_classification: parsed.classification, p_note: parsed.note, p_corrected_by: ownerId, p_reverse: false });
	return error ? fail(503, { v2CorrectionError: 'The version 2 correction was not recorded. Nothing changed.' }) : { v2Corrected: true as const };
}

export async function reverseCorrection(admin: SupabaseClient, ownerId: string, kind: 'legacy' | 'v2', form: FormData) {
	if (kind === 'legacy') {
		const parsed = legacyReversal(form);
		if (!parsed.ok) return fail(400, { correctionError: parsed.error });
		const { error } = await admin.rpc('analytics_record_classification_correction', { p_event_id: parsed.eventId, p_classification: 'unclassified', p_note: 'Reversal requested by the operator.', p_corrected_by: ownerId, p_reverse: true });
		return error ? fail(503, { correctionError: 'The reversal was not recorded. Nothing changed.' }) : { correctionUndone: true as const };
	}
	const parsed = v2Reversal(form);
	if (!parsed.ok) return fail(400, { v2CorrectionError: parsed.error });
	const { error } = await admin.rpc('analytics_record_event_v2_classification', { p_event_id: parsed.eventId, p_classification: 'unclassified', p_note: 'Reversal requested by the operator.', p_corrected_by: ownerId, p_reverse: true });
	return error ? fail(503, { v2CorrectionError: 'The version 2 reversal was not recorded. Nothing changed.' }) : { v2CorrectionUndone: true as const };
}
