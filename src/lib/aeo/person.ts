/**
 * The photographer, as one entity.
 *
 * WHY THIS IS A MODULE AND NOT A LITERAL IN THREE FILES
 *
 * The same story as `site-url.ts`, in the identity dimension. Three places in
 * this app published a `Person` for Nino Chavez and all three disagreed:
 *
 *   /about              jobTitle "Sports Photographer",
 *                       sameAs instagram.com/nino.chavez.photo
 *   /photo/<id>         jobTitle "Professional Sports Photographer",
 *                       sameAs instagram.com/ninochavez + twitter.com/ninochavez
 *   /api/ai/photos      no jobTitle, no sameAs at all
 *
 * The photo page was the wrong one, and it is on 20,655 of the gallery's
 * 20,922 sitemap URLs — so the overwhelming majority of this app's structured
 * data credited every photo to a different account than the watermark burned
 * into the photo itself (`utils/branded-image.ts` draws `@nino.chavez.photo`
 * onto every shared and downloaded image). It also used `twitter.com`, which
 * has been X for over two years, and which the main site's /links has already
 * moved off.
 *
 * `sameAs` is the property an answer engine uses to decide that two mentions
 * are one person. Three disjoint sets across one domain is the exact input
 * that splits an entity into three.
 *
 * SITE_ORIGIN is in `sameAs` on purpose: it ties the gallery's photographer to
 * the canonical entity at ninochavez.co/api/person.json, which lists the rest
 * of the profiles. Without it the gallery is an island.
 */

import { SITE_URL, SITE_ORIGIN } from '$lib/site-url';

/**
 * The photography account. This is the handle on the About page, in the footer,
 * and — the one that cannot be edited after the fact — burned into every
 * branded image by `utils/branded-image.ts`. `instagram.com/ninochavez` is the
 * personal account and is published by the main site, not by the gallery.
 */
export const PHOTOGRAPHY_INSTAGRAM = 'https://www.instagram.com/nino.chavez.photo';

/** Kept in step with the copy on /about. */
const KNOWS_ABOUT = [
	'Sports Photography',
	'Volleyball Photography',
	'Action Sports',
	'Event Photography'
] as const;

export interface PersonSchemaOptions {
	/** A page-specific description, when the page has one worth publishing. */
	description?: string;
	/**
	 * Extra subject areas for this page — e.g. the sport of the photo being
	 * viewed. Merged with the shared list and de-duplicated; falsy entries drop.
	 */
	knowsAbout?: ReadonlyArray<string | null | undefined>;
}

/**
 * The gallery's `Person`, for use as `mainEntity`, `creator`, or anywhere else
 * this app names the photographer in structured data.
 *
 * One `jobTitle` everywhere on purpose: "Sports Photographer" and "Professional
 * Sports Photographer" are two strings for one role, and a consumer comparing
 * them has no way to know that.
 */
export function personSchema(options: PersonSchemaOptions = {}) {
	return {
		'@type': 'Person',
		name: 'Nino Chavez',
		jobTitle: 'Sports Photographer',
		...(options.description ? { description: options.description } : {}),
		url: `${SITE_URL}/about`,
		sameAs: [PHOTOGRAPHY_INSTAGRAM, SITE_ORIGIN],
		knowsAbout: [...new Set([...KNOWS_ABOUT, ...(options.knowsAbout ?? [])].filter(Boolean))]
	};
}
