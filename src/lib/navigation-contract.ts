export const GLOBAL_NAVIGATION = [
				{ href: '/blog', label: 'Writing' },
	{ href: '/work', label: 'Building' },
	{ href: '/photography', label: 'Photography' },
	{ href: '/about', label: 'About' }
] as const;

export const MENU_NAVIGATION = [
	{ href: '/search', label: 'Search site' },
	...GLOBAL_NAVIGATION,
	{ href: '/now', label: 'Now' },
	{ href: '/links', label: 'Links' }
] as const;
