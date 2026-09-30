export const GLOBAL_NAVIGATION = [
	{ href: '/work', label: 'Work' },
	{ href: '/demos', label: 'Sessions' },
	{ href: '/learn', label: 'Learn' },
	{ href: '/blog', label: 'Writing' },
	{ href: '/photography', label: 'Photography' },
	{ href: '/about', label: 'About' }
] as const;

export const MENU_NAVIGATION = [
	{ href: '/search', label: 'Search site' },
	...GLOBAL_NAVIGATION,
	{ href: '/now', label: 'Now' },
	{ href: '/links', label: 'Links' }
] as const;
