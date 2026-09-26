/**
 * Spend ledger for the model-eval harness. Every OpenRouter call (vision + embeddings) logs a
 * line here and the running total is checked against a hard budget stop BEFORE each call, so a
 * runaway loop cannot blow through the $15 budget stated in the task brief.
 *
 * Ledger lives in .temp/eval/ (gitignored scratch output), never committed.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';

export const LEDGER_PATH = resolve(process.cwd(), '.temp/eval/spend-ledger.jsonl');
/** Hard stop: refuse further spend once cumulative logged cost reaches this. Leaves headroom
 * under the $15 task budget for embeddings + any manual reruns. */
export const BUDGET_USD = 12;

export interface SpendEntry {
	ts: string;
	job: string; // e.g. 'vision:google/gemini-2.5-flash-lite:production:fJKdsB-DSC08629'
	model: string;
	cost: number | null; // USD, null if provider didn't report cost (counted as 0 for the running total)
}

function ensureDir() {
	const dir = dirname(LEDGER_PATH);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function totalSpend(): number {
	if (!existsSync(LEDGER_PATH)) return 0;
	const lines = readFileSync(LEDGER_PATH, 'utf8').split('\n').filter(Boolean);
	let total = 0;
	for (const line of lines) {
		try {
			const entry: SpendEntry = JSON.parse(line);
			total += entry.cost ?? 0;
		} catch { /* skip malformed line */ }
	}
	return total;
}

/** Throws if logging this cost would exceed BUDGET_USD. Call BEFORE making the API request is not
 * possible (cost is only known after the response), so instead call this AFTER each response and
 * let the caller stop issuing further requests once it throws. */
export function logSpend(entry: Omit<SpendEntry, 'ts'>): number {
	ensureDir();
	const full: SpendEntry = { ts: new Date().toISOString(), ...entry };
	appendFileSync(LEDGER_PATH, JSON.stringify(full) + '\n');
	const total = totalSpend();
	if (total >= BUDGET_USD) {
		throw new Error(`BUDGET STOP: cumulative logged spend $${total.toFixed(4)} >= $${BUDGET_USD} hard stop. Last job: ${entry.job}`);
	}
	return total;
}

export function checkBudgetOrThrow(): void {
	const total = totalSpend();
	if (total >= BUDGET_USD) {
		throw new Error(`BUDGET STOP: cumulative logged spend $${total.toFixed(4)} >= $${BUDGET_USD} hard stop.`);
	}
}
