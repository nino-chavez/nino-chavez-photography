import type { Finding } from './intelligence-contract';

/**
 * Dismiss and snooze for findings shown inline (Home, the album report). The decisions live in the existing
 * tables: `analytics_intelligence_finding_lifecycle` holds the current state per owner, scope and finding, and the
 * dismiss or snooze row in `analytics_intelligence_actions` keeps the private reason and, in `target_context`,
 * the version of the finding that was dismissed. Nothing here is a new table.
 *
 * A dismissal hides one version of a finding. When the substance of a launch finding changes (its own total, its
 * comparison, its failure counts, the days it covers), the finding shows again, because the thing that was
 * dismissed is no longer what it says. Wording, the cutoff and a launch recap's sliding quiet window are not part
 * of the version, so a dismissed recap does not come back every morning.
 */

export interface LifecycleRow { owner_id: string; finding_id: string; status: string; snoozed_until: string | null }
export interface SettleAction { owner_id: string; finding_id: string | null; target_context: unknown; created_at: string }
export type SettledState = 'open' | 'dismissed' | 'snoozed';

function canonical(value: unknown): string {
	if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
	if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
	const row = value as Record<string, unknown>;
	return `{${Object.keys(row).filter((key) => row[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${canonical(row[key])}`).join(',')}}`;
}

/** FNV-1a, 32 bits: short, stable, and enough to tell two versions of one finding apart. */
function hash(text: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
	return h.toString(16).padStart(8, '0');
}

/** The substance of a finding: what it counts and over which days, never its wording, cutoff or quiet window. */
export function findingVersion(finding: Pick<Finding, 'id' | 'rule' | 'evidence'>): string {
	const e = finding.evidence;
	return hash(canonical({ id: finding.id, rule: finding.rule, units: e.units, window: e.windows.current, current: e.current, numerator: e.numerator, denominator: e.denominator, comparison: e.comparison }));
}

function versionOf(context: unknown): string | null {
	const value = context && typeof context === 'object' && !Array.isArray(context) ? (context as Record<string, unknown>).findingVersion : null;
	return typeof value === 'string' ? value : null;
}

/**
 * The state of one finding for the inline surfaces. Any active dismissal or snooze, by any owner, settles it.
 * A snooze ends at `snoozed_until`. With `checkVersion`, a dismissal recorded against another version of the
 * finding no longer applies; one recorded before versions were kept still does.
 */
export function settledState(finding: Finding, rows: readonly LifecycleRow[], actions: readonly SettleAction[], now: Date, checkVersion: boolean): SettledState {
	const latestBy = (owner: string) => actions.filter((action) => action.owner_id === owner && action.finding_id === finding.id).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
	const version = checkVersion ? findingVersion(finding) : null;
	let state: SettledState = 'open';
	for (const row of rows) {
		if (row.finding_id !== finding.id) continue;
		if (row.status === 'snooze' && (!row.snoozed_until || Date.parse(row.snoozed_until) <= now.getTime())) continue;
		if (row.status !== 'dismiss' && row.status !== 'snooze') continue;
		const latest = latestBy(row.owner_id);
		const recorded = latest ? versionOf(latest.target_context) : null;
		if (version && recorded && recorded !== version) continue;
		state = row.status === 'dismiss' ? 'dismissed' : state === 'dismissed' ? state : 'snoozed';
	}
	return state;
}

/** Only the findings no owner has dismissed or snoozed. */
export function openFindings(findings: readonly Finding[], rows: readonly LifecycleRow[], actions: readonly SettleAction[], now: Date, checkVersion: boolean): Finding[] {
	return findings.filter((finding) => settledState(finding, rows, actions, now, checkVersion) === 'open');
}
