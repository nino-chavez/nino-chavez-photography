/**
 * Unified "run one photo through one vision arm" — production prompt (extractOne, unchanged
 * import from src/lib/ai/ingest-extraction.ts, correction rounds included) or the improved prompt
 * (extractOneImproved). Both get the same retry/backoff for transient 429/5xx (observed live on
 * qwen/qwen3.8-flash — OpenRouter's shared upstream pool, not a payload problem) and the same
 * spend-ledger logging with the hard budget stop from lib/spend.ts.
 */
import { extractOne, type ExtractResult } from '../../../src/lib/ai/ingest-extraction';
import { extractOneImproved, type ImprovedExtractResult } from './improved-extraction';
import { logSpend, checkBudgetOrThrow } from './spend';
import type { Sport } from '../../../src/lib/ai/taxonomy';

export type PromptArm = 'production' | 'improved';

export interface RunArmOptions {
	model: string;
	arm: PromptArm;
	apiKey: string;
	albumSport: Sport | null;
	albumName?: string;
	/** For 'production': single full-frame buffer. For 'improved' with tiling, pass multiple. */
	buffers: Buffer[];
	jobLabel: string; // e.g. `${albumKey}-${imageKey}`, used in the spend ledger
	maxRetries?: number;
}

export interface RunArmResult {
	extraction: any;
	cost: number | null;
	rawText: string;
	attempts: number;
}

function isRetryable(err: any): boolean {
	return typeof err?.message === 'string' && err.message.startsWith('RETRY:');
}

export async function runArm(opts: RunArmOptions): Promise<RunArmResult> {
	checkBudgetOrThrow();
	const { model, arm, apiKey, albumSport, albumName, buffers, jobLabel, maxRetries = 4 } = opts;

	let lastErr: any;
	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			let result: ExtractResult | ImprovedExtractResult;
			if (arm === 'production') {
				result = await extractOne(buffers[0], { apiKey, model, albumSport, albumName });
			} else {
				result = await extractOneImproved(buffers, { apiKey, model, albumSport, albumName });
			}
			logSpend({ job: `vision:${arm}:${model}:${jobLabel}`, model, cost: result.cost });
			return { extraction: result.extraction, cost: result.cost, rawText: result.rawText, attempts: attempt + 1 };
		} catch (err: any) {
			lastErr = err;
			if (isRetryable(err) && attempt < maxRetries) {
				const backoffMs = Math.min(30000, 1000 * 2 ** attempt);
				await new Promise((r) => setTimeout(r, backoffMs));
				continue;
			}
			// Non-retryable, or retries exhausted: log a zero-cost failed attempt for the reliability
			// metric (JSON validity / OK rate) and rethrow so the caller can record the failure.
			logSpend({ job: `vision:${arm}:${model}:${jobLabel}:FAILED`, model, cost: 0 });
			throw err;
		}
	}
	throw lastErr;
}
