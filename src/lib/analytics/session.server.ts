import { env } from '$env/dynamic/private';
import { computeSessionHash, sessionHashKey } from './session';

let reportedMissingKey = false;

/**
 * The visitor identifier for an engagement event, or null when `ANALYTICS_SESSION_HASH_KEY` is not
 * set. Null means the caller records nothing (see `session.ts`). Say so once per isolate, so a
 * missing key shows in the logs instead of as a silent drop in the reports.
 */
export async function visitorSessionHash(ip: string, userAgent: string): Promise<string | null> {
	const key = sessionHashKey(env.ANALYTICS_SESSION_HASH_KEY);
	if (!key) {
		if (!reportedMissingKey) {
			console.error('[analytics] ANALYTICS_SESSION_HASH_KEY is not set (or shorter than 32 characters): engagement events are not recorded.');
			reportedMissingKey = true;
		}
		return null;
	}
	return computeSessionHash(ip, userAgent, key);
}
