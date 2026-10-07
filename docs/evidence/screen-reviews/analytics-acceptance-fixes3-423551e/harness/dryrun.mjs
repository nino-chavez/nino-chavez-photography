// A read-only dry run of the next scheduled refresh of the launch findings: the real evidence loader and the real rules, run now against production's read
// functions, written to a file and never to the database. The dev server's preload (preload.mjs) serves these findings in place of the stored snapshot's,
// so the captures show the wording the next refresh will store. Nothing is written anywhere in the application's database or provider accounts.
// usage (from the worktree, with .env.local exported into the process): node --import tsx <this file> <outFile> <albumKey...>
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const { createClient } = createRequire('~/Workspace/dev/sites/nino/nino-chavez-photography/.claude/worktrees/agent-a15271f0369faf0bf/package.json')('@supabase/supabase-js');
import { loadIntelligenceEvidence } from '~/Workspace/dev/sites/nino/nino-chavez-photography/.claude/worktrees/agent-a15271f0369faf0bf/src/lib/analytics/intelligence-source.server.ts';
import { evaluateIntelligenceRules } from '~/Workspace/dev/sites/nino/nino-chavez-photography/.claude/worktrees/agent-a15271f0369faf0bf/src/lib/analytics/intelligence-rules.ts';
import { GALLERY_LAUNCH_SCOPE, intelligenceScopeKey, launchScope } from '~/Workspace/dev/sites/nino/nino-chavez-photography/.claude/worktrees/agent-a15271f0369faf0bf/src/lib/analytics/intelligence-contract.ts';

const [out, ...albums] = process.argv.slice(2);
const client = createClient(process.env.PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const result = {};
for (const scope of [GALLERY_LAUNCH_SCOPE, ...albums.map(launchScope)]) {
	const key = intelligenceScopeKey(scope);
	const evidence = await loadIntelligenceEvidence(client, scope, new Date());
	const evaluated = evaluateIntelligenceRules(evidence);
	result[key] = evaluated.findings;
	console.log(key, evaluated.findings.map((f) => `${f.rule}:${f.id}`).join(', '));
}
writeFileSync(out, JSON.stringify(result, null, 1));
