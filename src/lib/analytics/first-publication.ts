/**
 * How the operator page names an album's first publication. Album age in every analytics
 * comparison counts from `album_settings.first_published_at`; the latest publication
 * (`published_at`, which the latest-gallery ranking sorts on) is a different fact and is
 * never shown here.
 */
export type FirstPublicationBasis = 'recorded' | 'inferred' | null | undefined;

/**
 * The first-publication date in the reporting timezone. A time recovered from a log after the
 * fact carries "(inferred)", so it never reads as one the database stamped. Null when none is on
 * record: the event or import date is never substituted.
 */
export function firstPublicationDate(value: string | null | undefined, basis: FirstPublicationBasis): string | null {
	if (!value) return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	const formatted = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric' }).format(date);
	return `${formatted}${basis === 'inferred' ? ' (inferred)' : ''}`;
}
