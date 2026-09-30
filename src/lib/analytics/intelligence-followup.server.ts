import type { SupabaseClient } from '@supabase/supabase-js';
import type { IntelligenceAction } from './intelligence-contract';
import type { IntelligenceRuleInput } from './intelligence-rules';

type FollowUp = NonNullable<IntelligenceRuleInput['followUp']>;
type FollowUpStatus = NonNullable<IntelligenceAction['followUpStatus']>;

function record(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function count(value: unknown): number | null {
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}
function coverage(value: unknown): 'complete' | 'partial' | 'unavailable' | null {
	return value === 'complete' || value === 'partial' || value === 'unavailable' ? value : null;
}

/**
 * Reads only persisted, identifier-free daily summaries. The database owns the
 * calendar and coverage calculation because gallery days are Chicago days while
 * public-site summaries use UTC days.
 */
export async function loadPersistedActionFollowUp(client: SupabaseClient, action: IntelligenceAction, now = new Date()): Promise<{ status: FollowUpStatus; followUp?: FollowUp }> {
	if (action.kind !== 'record' || !action.target || !action.actualAt || !action.primaryMeasure || !action.observationDays || !action.followUpAt) return { status: 'inconclusive' };
	if (Date.parse(action.followUpAt) > now.getTime()) return { status: 'pending' };
	const { data, error } = await client.rpc('analytics_intelligence_action_follow_up', {
		p_target: action.target,
		p_primary_measure: action.primaryMeasure,
		p_actual_at: action.actualAt,
		p_observation_days: action.observationDays
	});
	const row = record(data);
	const before = count(row?.before); const after = count(row?.after);
	const currentCoverage = coverage(row?.coverage); const previousCoverage = coverage(row?.previousCoverage);
	const measure = typeof row?.measure === 'string' ? row.measure : null;
	const window = record(row?.window); const beforeWindow = record(window?.before); const afterWindow = record(window?.after);
	if (error || before === null || after === null || !currentCoverage || !previousCoverage || !measure
		|| typeof beforeWindow?.start !== 'string' || typeof beforeWindow.end !== 'string'
		|| typeof afterWindow?.start !== 'string' || typeof afterWindow.end !== 'string') return { status: 'inconclusive' };
	if (currentCoverage !== 'complete' || previousCoverage !== 'complete') return { status: 'inconclusive' };
	return {
		status: 'ready',
		followUp: {
			actionId: action.id, target: action.target, before, after, coverage: currentCoverage, previousCoverage,
			concurrentChanges: 0, measure,
			window: { before: { start: beforeWindow.start, end: beforeWindow.end }, after: { start: afterWindow.start, end: afterWindow.end } }
		}
	};
}
