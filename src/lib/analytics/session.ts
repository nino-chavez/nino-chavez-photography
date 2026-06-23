/**
 * Per-visitor session identity for engagement dedup.
 *
 * Hashes IP + user-agent with SHA-256 (Web Crypto — available in the Cloudflare
 * Workers runtime and Node). The raw IP/UA never leave this function and are
 * never stored; only the digest is. Combined with engagement_events.event_day,
 * this dedups to one event per visitor / photo / type / day.
 */
export async function computeSessionHash(ip: string, userAgent: string): Promise<string> {
	const data = new TextEncoder().encode(`${ip}|${userAgent}`);
	const digest = await crypto.subtle.digest('SHA-256', data);
	return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
