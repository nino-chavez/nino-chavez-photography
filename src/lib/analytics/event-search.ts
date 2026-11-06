/**
 * Event-search address: the typed query plus the correlation id that ties `search_submitted` to the
 * `search_results_shown` the results page reports. Pass an id only for a real submission.
 */
export function eventSearchHref(path: string, query: string, searchId: string | null): string {
	const params = new URLSearchParams();
	const trimmed = query.trim();
	if (trimmed) {
		params.set('q', trimmed);
		if (searchId) params.set('search_id', searchId);
	}
	const qs = params.toString();
	return qs ? `${path}?${qs}` : path;
}
