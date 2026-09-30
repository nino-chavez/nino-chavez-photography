import type { SupabaseClient } from '@supabase/supabase-js';

export type IntelligenceOutcomeKind = 'unknown' | 'inquiry' | 'booking' | 'other';

export interface IntelligenceOutcome {
	id: string;
	actionId: string;
	outcome: IntelligenceOutcomeKind;
	/** A coarse count only. Zero is meaningful and is preserved. */
	outcomeCount: number | null;
	note: string | null;
	createdAt: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OUTCOMES = new Set<IntelligenceOutcomeKind>(['unknown', 'inquiry', 'booking', 'other']);
const MAX_ACTION_IDS = 20;

function decodeOutcome(value: unknown): IntelligenceOutcome | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const row = value as Record<string, unknown>;
	if (!UUID.test(String(row.id)) || !UUID.test(String(row.action_id)) || !OUTCOMES.has(row.outcome as IntelligenceOutcomeKind)
		|| typeof row.created_at !== 'string' || Number.isNaN(Date.parse(row.created_at))) return null;
	const outcomeCount = row.outcome_count === null ? null : Number.isSafeInteger(row.outcome_count) && (row.outcome_count as number) >= 0 && (row.outcome_count as number) <= 100000 ? row.outcome_count as number : undefined;
	const note = row.note === null ? null : typeof row.note === 'string' && row.note.length > 0 && row.note.length <= 500 ? row.note : undefined;
	if (outcomeCount === undefined || note === undefined) return null;
	return { id: row.id as string, actionId: row.action_id as string, outcome: row.outcome as IntelligenceOutcomeKind, outcomeCount, note, createdAt: row.created_at };
}

/**
 * Reads the newest appended outcome for each supplied, owned recorded action.
 * This uses an explicit owner predicate even though the caller is service-role.
 */
export async function loadLatestIntelligenceOutcomes(
	client: SupabaseClient,
	ownerId: string,
	actionIds: readonly string[]
): Promise<Map<string, IntelligenceOutcome>> {
	const ids = [...new Set(actionIds)];
	if (!UUID.test(ownerId) || ids.length > MAX_ACTION_IDS || ids.some((id) => !UUID.test(id))) return new Map();
	if (ids.length === 0) return new Map();
	const { data, error } = await client
		.from('analytics_intelligence_outcomes')
		.select('id, action_id, outcome, outcome_count, note, created_at')
		.eq('owner_id', ownerId)
		.in('action_id', ids)
		.order('created_at', { ascending: false })
		.order('id', { ascending: false });
	if (error) throw new Error('intelligence outcomes unavailable');
	const latest = new Map<string, IntelligenceOutcome>();
	for (const row of data ?? []) {
		const outcome = decodeOutcome(row);
		if (outcome && !latest.has(outcome.actionId)) latest.set(outcome.actionId, outcome);
	}
	return latest;
}
