/**
 * Per-visitor session identity for engagement de-duplication.
 *
 * HMAC-SHA-256 over IP + user-agent, under a key held only on the server
 * (`ANALYTICS_SESSION_HASH_KEY`, read by `session.server.ts`). The raw IP/UA never leave this
 * function and are never stored; only the digest is. Without the key the digest cannot be
 * recomputed from an IP address and browser string, which is what makes it one-way. Combined with
 * engagement_events.event_day, this dedups to one event per visitor / photo / type / day.
 *
 * The key is not rotated daily: reports count distinct visitors across multi-day periods
 * (`analytics_private.count_distinct_visitors`), so a visitor keeps one identifier for as long as
 * raw rows are kept (90 days).
 *
 * No key, no identifier: callers then record nothing, because an event without an identity
 * escapes the de-duplication indexes and would inflate counts. Web Crypto, so it runs on the
 * Cloudflare Workers runtime and in Node.
 */

/** Shorter keys are treated as missing: a short key is guessable, which defeats the point. */
export const SESSION_HASH_KEY_MIN_LENGTH = 32;

export function sessionHashKey(raw: string | null | undefined): string | null {
	const key = raw?.trim();
	return key && key.length >= SESSION_HASH_KEY_MIN_LENGTH ? key : null;
}

export async function computeSessionHash(ip: string, userAgent: string, key: string | null): Promise<string | null> {
	if (!key) return null;
	const encoder = new TextEncoder();
	const hmacKey = await crypto.subtle.importKey('raw', encoder.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	const digest = await crypto.subtle.sign('HMAC', hmacKey, encoder.encode(`${ip}|${userAgent}`));
	return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
