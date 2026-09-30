import type { SupabaseClient } from '@supabase/supabase-js';
import type { DailyActionRow } from './report-contract';

export const COMPACT_EVIDENCE_COLUMNS = [
	'bucket_date', 'album_key', 'photo_id', 'event_type', 'source', 'source_kind', 'sport',
	'event_date', 'album_event_type', 'publication_at', 'photo_category',
	'traffic_classification', 'action_count', 'coverage_state', 'latest_event_at'
] as const;

interface CoverageRow {
	bucket_date: string;
	coverage_state: 'complete' | 'partial' | 'unavailable';
	cutoff_at: string;
	reconciled_at?: string;
	catalogue_basis?: string;
}
export interface ReportEvidence { rows: DailyActionRow[]; coverage: CoverageRow[] }

/** Decode the private compact protocol without changing the report's measurement contract. */
export function decodeReportEvidence(value: unknown): ReportEvidence {
	if (!value || typeof value !== 'object') throw new Error('Invalid analytics evidence');
	const body = value as { columns?: unknown; rows?: unknown; coverage?: unknown };
	if (!Array.isArray(body.rows) || !Array.isArray(body.coverage)) throw new Error('Invalid analytics evidence');
	if (body.columns === undefined) {
		if (body.rows.some(row => !row || typeof row !== 'object' || Array.isArray(row))) throw new Error('Invalid legacy analytics evidence');
		return { rows: body.rows as DailyActionRow[], coverage: body.coverage as CoverageRow[] };
	}
	if (!Array.isArray(body.columns) || body.columns.length !== COMPACT_EVIDENCE_COLUMNS.length
		|| body.columns.some((name, index) => name !== COMPACT_EVIDENCE_COLUMNS[index])) throw new Error('Invalid analytics evidence columns');
	const rows = body.rows.map((row: unknown) => {
		if (!Array.isArray(row) || row.length !== COMPACT_EVIDENCE_COLUMNS.length) throw new Error('Invalid compact analytics row');
		return Object.fromEntries(COMPACT_EVIDENCE_COLUMNS.map((name, index) => [name, row[index]])) as unknown as DailyActionRow;
	});
	return { rows, coverage: body.coverage as CoverageRow[] };
}

/** A missing new RPC is the only fallback: timeouts and invalid data stay errors. */
export async function fetchReportEvidence(client: SupabaseClient, start: string, end: string): Promise<ReportEvidence> {
	const args = { p_start: start, p_end: end };
	let result = await client.rpc('analytics_read_report_evidence_compact', args);
	if (result.error?.code === 'PGRST202') result = await client.rpc('analytics_read_report_evidence', args);
	if (result.error) throw result.error;
	return decodeReportEvidence(result.data);
}
