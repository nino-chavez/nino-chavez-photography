import type { SupabaseClient } from '@supabase/supabase-js';
import { GALLERY_LAUNCH_SCOPE, intelligenceScopeKey, launchScope, type Finding, type IntelligenceScope } from './intelligence-contract';

/**
 * Test support: a fake service-role client with just enough of PostgREST (select, eq, in, order, limit,
 * maybeSingle) to run the public projection against rows a test chooses. Synthetic data only.
 */
type Row = Record<string, unknown>;
export interface PublicWorld {
	/** Current snapshot findings per scope. */
	snapshots: Array<{ scope: IntelligenceScope; findings: Finding[]; checkedAt?: string }>;
	albums: string[];
	unlisted?: string[];
	photos?: Array<{ photo_id: string; album_key: string }>;
	lifecycle?: Array<{ owner_id: string; scope: IntelligenceScope; finding_id: string; status: 'open' | 'dismiss' | 'snooze'; snoozed_until: string | null }>;
	actions?: Array<{ owner_id: string; scope: IntelligenceScope; finding_id: string; kind: 'dismiss' | 'snooze'; target_context: Row; created_at: string }>;
	failLifecycle?: boolean;
}

export function publicClient(world: PublicWorld): SupabaseClient {
	const tables: Record<string, Row[]> = {
		analytics_intelligence_snapshot_current: world.snapshots.map((s) => ({
			scope_key: intelligenceScopeKey(s.scope), updated_at: s.checkedAt ?? '2026-10-06T16:45:00Z',
			snapshot: { snapshot_id: '00000000-0000-4000-8000-000000000001', scope_key: intelligenceScopeKey(s.scope), generated_at: '2026-10-06T12:00:00Z', findings: s.findings }
		})),
		albums: world.albums.map((album_key) => ({ album_key })),
		album_settings: world.albums.map((album_key) => ({ album_key, visibility: world.unlisted?.includes(album_key) ? 'unlisted' : 'public' })),
		photo_metadata: world.photos ?? [],
		analytics_intelligence_finding_lifecycle: (world.lifecycle ?? []).map((row) => ({ ...row, scope_key: intelligenceScopeKey(row.scope) })),
		analytics_intelligence_actions: (world.actions ?? []).map((row) => ({ ...row, scope_key: intelligenceScopeKey(row.scope) }))
	};
	return {
		from(table: string) {
			let rows = [...(tables[table] ?? [])];
			const failing = world.failLifecycle && table === 'analytics_intelligence_finding_lifecycle';
			const result = () => (failing ? { data: null, error: { message: 'down' } } : { data: rows, error: null });
			const chain: Row = {
				select: () => chain, order: () => chain, limit: () => chain,
				eq: (column: string, value: unknown) => { rows = rows.filter((row) => row[column] === value); return chain; },
				in: (column: string, values: unknown[]) => { rows = rows.filter((row) => values.includes(row[column])); return chain; },
				maybeSingle: async () => (failing ? result() : { data: rows[0] ?? null, error: null }),
				then: (resolve: (value: unknown) => unknown) => resolve(result())
			};
			return chain;
		}
	} as unknown as SupabaseClient;
}

export function launchFinding(id: string, albumKey: string, over: Partial<Finding> = {}): Finding {
	return {
		id, rule: 'launch_finished', severity: 'low', target: { kind: 'album', albumKey }, title: 'The launch is over', explanation: 'Synthetic.', action: 'Look.',
		evidence: { windows: { current: { start: '2026-09-26', end: '2026-10-02' }, previous: { start: '2026-10-03', end: '2026-10-05' } }, cutoff: '2026-10-06T05:00:00Z', coverage: 'complete', units: 'photo opens', current: 266, previous: 0, strength: 'limited' },
		reportHref: `/analytics/albums/${albumKey}`, status: 'open', ...over
	};
}

export const HOME = GALLERY_LAUNCH_SCOPE;
export const albumScope = launchScope;
