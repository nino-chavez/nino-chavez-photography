/**
 * Pagination parsing for the public `/api/ai/*` surface.
 *
 * Each endpoint used to do its own `parseInt(url.searchParams.get('limit') || '50')`, and all
 * three failed the same two ways:
 *
 *   ?limit=abc   -> NaN -> `.range(NaN, NaN)` -> 200 with `"albums": [], "limit": null`.
 *                  A payload that says `"total": 249` and hands back nothing, with no error.
 *   ?limit=-5    -> `.range(0, -6)` -> PostgREST error -> 500 "Failed to fetch photos".
 *
 * Both are worse here than on a browser route: this surface exists for crawlers and answer
 * engines, which cannot see that they asked wrongly. A 500 reads as "the server is broken"
 * and gets retried or deprioritised; a silent empty page reads as "there are no photos".
 *
 * So: reject bad input with 400 and a message naming the parameter and what was wrong —
 * matching how `/api/ai/search` already answers a missing `q`. Clamp only where clamping is
 * unambiguous (a limit above the maximum means "give me as much as you can").
 */

export interface Pagination {
	limit: number;
	offset: number;
}

export interface PaginationSpec {
	/** Used when the parameter is absent. */
	defaultLimit: number;
	/** Values above this are clamped down, not rejected. */
	maxLimit: number;
}

export type PaginationResult = { ok: true; value: Pagination } | { ok: false; error: string };

/**
 * Parses one integer parameter. Absent -> `fallback`. Anything that is not a base-10
 * non-negative integer is an error, INCLUDING inputs `parseInt` would happily accept:
 * `parseInt('5abc')` is 5 and `parseInt('1e3')` is 1, neither of which is what was asked for.
 */
function parseNonNegativeInt(
	raw: string | null,
	name: string,
	fallback: number
): { ok: true; value: number } | { ok: false; error: string } {
	if (raw === null || raw === '') return { ok: true, value: fallback };
	if (!/^\d+$/.test(raw.trim())) {
		return {
			ok: false,
			error: `Invalid ${name}: expected a non-negative integer, got ${JSON.stringify(raw)}`
		};
	}
	const value = Number(raw.trim());
	if (!Number.isSafeInteger(value)) {
		return { ok: false, error: `Invalid ${name}: ${JSON.stringify(raw)} is out of range` };
	}
	return { ok: true, value };
}

export function parsePagination(params: URLSearchParams, spec: PaginationSpec): PaginationResult {
	const limit = parseNonNegativeInt(params.get('limit'), 'limit', spec.defaultLimit);
	if (!limit.ok) return { ok: false, error: limit.error };

	const offset = parseNonNegativeInt(params.get('offset'), 'offset', 0);
	if (!offset.ok) return { ok: false, error: offset.error };

	return { ok: true, value: { limit: Math.min(limit.value, spec.maxLimit), offset: offset.value } };
}

/**
 * Validates a filter value against a controlled vocabulary.
 *
 * An unknown value used to reach the database as-is and come back as an empty page, so
 * `?sport=quidditch` and `?sport=Volleyball` both answered `{"photos": [], "total": 0}` —
 * identical to an honest "we have no photos of that". A crawler cannot tell a typo from a
 * gap in the catalogue, and the capitalised one is the mistake a caller is most likely to
 * actually make.
 *
 * Deliberately NOT case-normalised. Accepting `Volleyball` would give the API two spellings
 * for one value; the error names the allowed set instead, which teaches the caller the right
 * one. `null`/absent is not a filter and always passes.
 */
export function validateFilter(
	raw: string | null,
	name: string,
	vocabulary: readonly string[]
): { ok: true; value: string | undefined } | { ok: false; error: string } {
	if (raw === null || raw === '') return { ok: true, value: undefined };
	if (!vocabulary.includes(raw)) {
		return {
			ok: false,
			error: `Invalid ${name}: ${JSON.stringify(raw)} is not one of ${vocabulary.join(', ')}`
		};
	}
	return { ok: true, value: raw };
}

/**
 * A four-digit year. Unlike limit/offset there is no clamping and no catalogue range check:
 * a year we hold no photos for is an honest empty result, not a caller error.
 */
export function parseYear(
	raw: string | null,
	name = 'year'
): { ok: true; value: number | undefined } | { ok: false; error: string } {
	if (raw === null || raw === '') return { ok: true, value: undefined };
	if (!/^\d{4}$/.test(raw.trim())) {
		return { ok: false, error: `Invalid ${name}: expected a four-digit year, got ${JSON.stringify(raw)}` };
	}
	return { ok: true, value: Number(raw.trim()) };
}

/**
 * Inclusive timestamp bounds for a calendar year, for date-range overlap filters.
 * An album overlaps the year when `earliest <= yearEnd AND latest >= yearStart`.
 */
export function yearBounds(year: number): { start: string; end: string } {
	return { start: `${year}-01-01T00:00:00`, end: `${year}-12-31T23:59:59.999` };
}
