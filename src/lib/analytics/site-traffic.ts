/** Shared route taxonomy for the ninochavez.co traffic report. */
export const SITE_SECTIONS = [
	{ key: 'profile', label: 'Profile & work', prefix: '/' },
	{ key: 'writing', label: 'Writing', prefix: '/blog' },
	{ key: 'demos', label: 'Demos', prefix: '/demos' },
	{ key: 'photography', label: 'Photography', prefix: '/photography' },
	{ key: 'other', label: 'Other pages', prefix: '' }
] as const;

export type SiteSection = (typeof SITE_SECTIONS)[number]['key'];
export type SitePeriod = 7 | 30 | 90;

export function sectionForPath(path: string): SiteSection {
	if (path === '/blog' || path.startsWith('/blog/')) return 'writing';
	if (path === '/demos' || path.startsWith('/demos/')) return 'demos';
	if (path === '/photography' || path.startsWith('/photography/')) return 'photography';
	if (path === '/' || /^\/(?:work|about|now|links|learn|search)(?:\/|$)/.test(path)) return 'profile';
	return 'other';
}
