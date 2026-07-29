/**
 * Shape check for an album key, shared by every endpoint that takes one from a query string.
 *
 * Album keys are SmugMug-derived: all 262 in the database are exactly six alphanumeric
 * characters. The bound here is deliberately looser than that so a future ingest with a
 * different key format is not silently broken, and tight enough to exclude what matters:
 * path separators, the `:` that delimits the ZIP worker's signed payload, and unbounded length.
 *
 * WHY THIS IS A MODULE AND NOT A CONST IN ONE ROUTE
 *
 * `/api/zip-url` validated the key; `/api/album-photos` — the endpoint zip-url's own comment
 * names as sharing its boundary — did not. Anything at all reached its PostgREST query and came
 * back `200 {"photos":[]}`: a 500-character key, `../../etc/passwd`, `*`, a bare space. Nothing
 * leaked (PostgREST parameterises `.eq()`), but each distinct string minted its own
 * `s-maxage=300, stale-while-revalidate=86400` entry in a shared cache that cannot be purged,
 * and callers could not tell "this album has no photos" from "there is no such album".
 *
 * The ZIP worker keeps its own copy in cloudflare-worker/album-zip/src/request-guards.ts. That
 * duplication is deliberate — it is a separately deployed service and must not be able to break
 * on an app-side refactor — and the pattern is identical on both sides on purpose.
 */
export const ALBUM_KEY_PATTERN = /^[A-Za-z0-9_-]{1,32}$/;

export function isValidAlbumKey(value: string | null | undefined): value is string {
	return !!value && ALBUM_KEY_PATTERN.test(value);
}
