/**
 * The shortlist: the photos the owner has set aside to post or send, kept in this browser for this tab and
 * exported as a CSV. It is the owner's private working set, so it is offered only when signed in, on the album report
 * and on the photo explorer alike. Both pages read and write it here, under one key, so a shortlist made on one
 * is there on the other.
 */

export const SHORTLIST_KEY = 'analytics:photo-shortlist';
/** The most ids kept, which also bounds the CSV address. */
export const SHORTLIST_LIMIT = 500;

/** The ids stored, or none: a missing, damaged or blocked store is an empty shortlist, never an error. */
export function readShortlist(storage: Pick<Storage, 'getItem'> | null = typeof sessionStorage === 'undefined' ? null : sessionStorage): string[] {
	try {
		const stored = JSON.parse(storage?.getItem(SHORTLIST_KEY) ?? '[]');
		return Array.isArray(stored) ? stored.filter((value): value is string => typeof value === 'string').slice(0, SHORTLIST_LIMIT) : [];
	} catch {
		return [];
	}
}

/** Keeps the ids for later pages. When the browser refuses, the shortlist lasts for this page only. */
export function writeShortlist(ids: string[], storage: Pick<Storage, 'setItem'> | null = typeof sessionStorage === 'undefined' ? null : sessionStorage): void {
	try {
		storage?.setItem(SHORTLIST_KEY, JSON.stringify(ids.slice(0, SHORTLIST_LIMIT)));
	} catch {
		/* the shortlist then lasts for this page only */
	}
}

/**
 * The start of the sentence that tells a visitor what signing in adds, for two or more things:
 * "Shortlisting, recording what you did and private sharing notes need". The page adds the sign-in link.
 */
export function signInNeeds(things: [string, string, ...string[]]): string {
	const list = `${things.slice(0, -1).join(', ')} and ${things.at(-1)}`;
	return `${list[0].toUpperCase()}${list.slice(1)} need`;
}
