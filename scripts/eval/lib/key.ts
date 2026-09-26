/**
 * OpenRouter key resolution for eval scripts: OPENROUTER_API_KEY from the environment, else read
 * from 1Password at runtime (`op read`, the owned mapping in ENRICHMENT_WORKFLOW.md). The key is
 * never written to disk: an earlier version cached it in .temp/eval/or.key, which left a plaintext
 * copy in a worktree after the run (found and deleted 2026-09-26). Never print the key.
 */
import { execFileSync } from 'child_process';

const OP_REF = 'op://Developer Secrets/OpenRouter photography/credential';

let cached: string | null = null;

export function getOpenRouterKey(): string {
	if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
	if (cached) return cached;
	try {
		cached = execFileSync('op', ['read', OP_REF], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
	} catch {
		throw new Error(`getOpenRouterKey: no OPENROUTER_API_KEY and \`op read '${OP_REF}'\` failed; check 1Password CLI access.`);
	}
	if (!cached) throw new Error(`getOpenRouterKey: ${OP_REF} is empty`);
	return cached;
}
