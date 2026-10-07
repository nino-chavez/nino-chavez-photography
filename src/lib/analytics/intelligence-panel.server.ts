import type { SupabaseClient } from '@supabase/supabase-js';
import type { Finding, IntelligenceScope } from './intelligence-contract';
import { loadPublicFindings } from './intelligence-public.server';

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

/** The findings a page shows inline for a scope, after the store's visibility check, with when they were last checked. */
export interface VisibleFindings { findings: Finding[]; checkedAt: string | null }

type LoadReport = (admin: SupabaseClient, scope: IntelligenceScope) => Promise<{ findings: Finding[]; checkedAt?: string | null; generatedAt: string }>;

/** The public projection, with dismissed and snoozed launch findings left out for everyone. */
const loadStoredReport: LoadReport = (admin, scope) => loadPublicFindings(admin, scope);

/**
 * Same rule as the panel, for findings shown inline (Home, the album report). The findings come through the
 * store's public projection, so an album unlisted since the snapshot was written, or a photo moved out of it,
 * drops out, and so does a launch finding the owner dismissed or snoozed. A scope with no snapshot, a snapshot
 * with no findings, or a failed read all give an empty list: the page then shows nothing, never an error panel
 * and never "no findings".
 */
export async function loadVisibleFindings(admin: SupabaseClient, scope: IntelligenceScope, label: string, load: LoadReport = loadStoredReport): Promise<VisibleFindings> {
	try {
		const report = await load(admin, scope);
		return { findings: report.findings, checkedAt: report.checkedAt ?? report.generatedAt };
	} catch (cause) {
		const message = cause instanceof Error ? cause.message : String(cause);
		// No snapshot yet is the ordinary state of a new scope, not a failure worth logging.
		if (message !== 'intelligence report unavailable') console.error(`[${label}] findings unavailable:`, message);
		return { findings: [], checkedAt: null };
	}
}

/** The panel mode from findings that already passed the visibility check. */
export function findingsPanelMode(findings: readonly Finding[], owner: boolean): IntelligencePanelMode {
	if (findings.length > 0) return 'report';
	return owner ? 'record' : 'none';
}
