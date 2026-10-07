/**
 * What makes two intelligence snapshots the same. A refresh writes a new snapshot only when this changes.
 *
 * Left out, wherever they appear: `generatedAt` (the time the rules ran), `cutoff` (the summary refresh time,
 * which moves every 30 minutes while the counts behind it stay the same) and `asOf` (the instant a launch read
 * was asked for). Everything else counts, including the last complete day a launch read covers, so a new day of
 * data always writes a new snapshot. Key order and absent-versus-undefined do not matter: the comparison is
 * made after a round trip through PostgreSQL jsonb, which reorders keys and drops undefined values.
 */
export interface SnapshotContent {
	coverage: unknown;
	findings: unknown;
	suppressions: unknown;
	evidence: unknown;
}

const VOLATILE = new Set(['generatedAt', 'cutoff', 'asOf']);

function canonical(value: unknown): string {
	if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
	if (Array.isArray(value)) return `[${value.map((item) => (item === undefined ? 'null' : canonical(item))).join(',')}]`;
	const row = value as Record<string, unknown>;
	return `{${Object.keys(row).filter((key) => row[key] !== undefined && !VOLATILE.has(key)).sort().map((key) => `${JSON.stringify(key)}:${canonical(row[key])}`).join(',')}}`;
}

export function snapshotFingerprint(content: SnapshotContent): string {
	return canonical({ coverage: content.coverage, findings: content.findings, suppressions: content.suppressions, evidence: content.evidence });
}
