// Probe: what does Home's gallery-week report say about traffic classes?
import { createRequire } from 'node:module';
const { createClient } = createRequire('~/Workspace/dev/sites/nino/nino-chavez-photography/.claude/worktrees/agent-a15271f0369faf0bf/package.json')('@supabase/supabase-js');
import { buildOperatorReport } from '~/Workspace/dev/sites/nino/nino-chavez-photography/.claude/worktrees/agent-a15271f0369faf0bf/src/lib/analytics/operator-report.server.ts';
import { parseReportQuery } from '~/Workspace/dev/sites/nino/nino-chavez-photography/.claude/worktrees/agent-a15271f0369faf0bf/src/lib/analytics/report-contract.ts';
const client = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const asOf = new Date();
const params = new URLSearchParams({ period: 'custom', start: '2026-09-30', end: '2026-10-06', scope: 'all', measure: 'photo_opens', traffic: 'conservative', compare: 'previous' });
const report = await buildOperatorReport(client, parseReportQuery(params, asOf), { publicOnly: true, photoWindow: { page: 0, pageSize: 0, rank: 'popular' }, includeDiagnostics: false, includeVisitorEstimate: false, includeToday: false, cacheRole: 'service_role' });
console.log('available', report.available, 'traffic', JSON.stringify(report.traffic));
const p2 = new URLSearchParams({ period: 'custom', start: '2026-09-30', end: '2026-10-06', scope: 'all', measure: 'photo_opens', traffic: 'inclusive', compare: 'none' });
const r2 = await buildOperatorReport(client, parseReportQuery(p2, asOf), { publicOnly: true, photoWindow: { page: 0, pageSize: 0, rank: 'popular' }, includeDiagnostics: false, includeVisitorEstimate: false, includeToday: false, cacheRole: 'service_role' });
console.log('inclusive traffic', JSON.stringify(r2.traffic));
