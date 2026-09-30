import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { COMPACT_EVIDENCE_COLUMNS, decodeReportEvidence, fetchReportEvidence } from './report-evidence.server';

const row = ['2026-09-20', 'synthetic-album', 'synthetic-photo', 'view', 'gallery', 'internal_open_location', 'volleyball', null, 'unknown', null, 'action', 'audience', 4, 'complete', '2026-09-20T12:00:00Z'];
test('compact and object protocols produce the same measurement row', () => {
	const object = Object.fromEntries(COMPACT_EVIDENCE_COLUMNS.map((name, index) => [name, row[index]]));
	assert.deepEqual(decodeReportEvidence({ columns: COMPACT_EVIDENCE_COLUMNS, rows: [row], coverage: [] }), decodeReportEvidence({ rows: [object], coverage: [] }));
});
test('a corrupted column order or row cannot silently become zero', () => {
	assert.throws(() => decodeReportEvidence({ columns: [...COMPACT_EVIDENCE_COLUMNS].reverse(), rows: [row], coverage: [] }));
	assert.throws(() => decodeReportEvidence({ columns: COMPACT_EVIDENCE_COLUMNS, rows: [row.slice(1)], coverage: [] }));
	assert.throws(() => decodeReportEvidence({ rows: [row], coverage: [] }));
});
test('only missing-RPC errors use the deployment fallback', async () => {
	const calls: string[] = [];
	const client = { async rpc(name: string) { calls.push(name); return name.endsWith('_compact') ? { data: null, error: { code: 'PGRST202' } } : { data: { rows: [], coverage: [] }, error: null }; } } as unknown as SupabaseClient;
	assert.deepEqual(await fetchReportEvidence(client, '2026-09-20', '2026-09-21'), { rows: [], coverage: [] });
	assert.deepEqual(calls, ['analytics_read_report_evidence_compact', 'analytics_read_report_evidence']);
	const timeout = { async rpc() { return { data: null, error: { code: '57014' } }; } } as unknown as SupabaseClient;
	await assert.rejects(() => fetchReportEvidence(timeout, '2026-09-20', '2026-09-21'), error => (error as { code: string }).code === '57014');
});
