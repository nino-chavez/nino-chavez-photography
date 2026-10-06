import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Whether a report page shows the findings panel, the owner's private record form, or nothing.
 *
 * The panel earns its place only when the saved calculation for exactly this scope holds at least one
 * finding. A snapshot with no findings would render "No actionable findings" on every visit, which is
 * the always-empty panel the launch rethink removed (docs/design/experience-brief.md, anti-goals). The
 * owner keeps the private record form either way; visitors see nothing until there is something to say.
 */
export type IntelligencePanelMode = 'report' | 'record' | 'none';

type CurrentRow = { analytics_intelligence_snapshots: { findings: unknown } | null } | null;

export function intelligencePanelMode(current: CurrentRow, owner: boolean): IntelligencePanelMode {
	const findings = current?.analytics_intelligence_snapshots?.findings;
	if (Array.isArray(findings) && findings.length > 0) return 'report';
	return owner ? 'record' : 'none';
}

/** One read: the current snapshot for the scope and its findings. A failed read shows no panel, never an error panel. */
export async function loadIntelligencePanelMode(admin: SupabaseClient, scopeKey: string, owner: boolean, label: string): Promise<IntelligencePanelMode> {
	try {
		const { data, error } = await admin
			.from('analytics_intelligence_snapshot_current')
			.select('analytics_intelligence_snapshots(findings)')
			.eq('scope_key', scopeKey)
			.maybeSingle();
		if (error) {
			console.error(`[${label}] snapshot lookup failed:`, error.message);
			return intelligencePanelMode(null, owner);
		}
		return intelligencePanelMode(data as CurrentRow, owner);
	} catch (cause) {
		console.error(`[${label}] snapshot lookup failed:`, cause instanceof Error ? cause.message : cause);
		return intelligencePanelMode(null, owner);
	}
}
