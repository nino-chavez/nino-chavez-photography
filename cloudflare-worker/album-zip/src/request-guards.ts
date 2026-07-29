/**
 * Shape checks applied before any signature work or upstream call.
 *
 * These are not access control — the signature is what binds a request to a five-minute
 * window. They keep malformed input out of a payload that is a contract between two
 * independently deployed services, and out of the upstream manifest fetch.
 */

/**
 * Album keys are SmugMug-derived: all 262 in the database are exactly six alphanumeric
 * characters. The bound here is deliberately looser than that so a future ingest with a
 * different key format is not silently broken, but tight enough to exclude the three things
 * that matter: path separators, the `:` that delimits the signed payload, and unbounded length.
 *
 * `/api/zip-url` signed anything at all — a 500-character string, `../../etc/passwd`, and
 * `A:large:9999999999` all came back with valid signatures. That file's own comment justifies
 * restricting `quality` so the field "cannot carry arbitrary attacker-chosen text into a
 * signature", while the album key beside it carried exactly that, unbounded. The same pattern
 * is applied on both sides now.
 */
export const ALBUM_KEY_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

export function isValidAlbumKey(value: string | null): value is string {
	return !!value && ALBUM_KEY_PATTERN.test(value);
}

/** How long a signed URL stays usable. */
export const SIGNATURE_MAX_AGE_S = 300;

/**
 * Tolerance for the signer's clock running ahead of the verifier's. They are separate
 * deployments on separate hosts; a timestamp a few seconds in the future is ordinary skew,
 * not an attack.
 */
export const CLOCK_SKEW_ALLOWANCE_S = 60;

/**
 * Is `ts` inside the signing window?
 *
 * The previous check was `now - tsNum > SIGNATURE_MAX_AGE_S`, which bounds only the past. A
 * timestamp in the future yields a negative age, which is never greater than 300, so a signature
 * dated next year would have been accepted indefinitely. Nothing exploited that — the signer
 * chooses `ts` and never emits a future one — but "no attacker can reach it today" is a property
 * of the other service, not of this check, and this is the file that has to hold if that changes.
 */
export function isFreshTimestamp(ts: string | null, nowSeconds: number): boolean {
	if (!ts || !/^\d{1,15}$/.test(ts)) return false;
	const parsed = Number(ts);
	if (!Number.isSafeInteger(parsed)) return false;
	const age = nowSeconds - parsed;
	return age <= SIGNATURE_MAX_AGE_S && age >= -CLOCK_SKEW_ALLOWANCE_S;
}
