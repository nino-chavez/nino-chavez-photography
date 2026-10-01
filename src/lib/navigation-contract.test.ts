import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { GLOBAL_NAVIGATION, MENU_NAVIGATION } from './navigation-contract';

const root = new URL('../../', import.meta.url);

async function source(path: string) {
	return readFile(new URL(path, root), 'utf8');
}

test('global navigation uses the shared labels and destinations', () => {
	assert.deepEqual(GLOBAL_NAVIGATION, [
								{ href: '/blog', label: 'Writing' },
	{ href: '/work', label: 'Building' },
		{ href: '/photography', label: 'Photography' },
		{ href: '/about', label: 'About' }
	]);
	assert.deepEqual(MENU_NAVIGATION, [
		{ href: '/search', label: 'Search site' },
		...GLOBAL_NAVIGATION,
		{ href: '/now', label: 'Now' },
		{ href: '/links', label: 'Links' }
	]);
});

test('gallery shell uses an accessible global-menu dialog without replacing gallery navigation', async () => {
	const header = await source('src/lib/components/layout/Header.svelte');
	assert.match(header, /GLOBAL_NAVIGATION/);
	assert.match(header, /MENU_NAVIGATION/);
	assert.match(header, /<dialog[\s\S]*id="site-menu-dialog"[\s\S]*aria-labelledby="site-menu-title"/);
	assert.match(header, /menuDialog\.showModal\(\)/);
	assert.match(header, /<svelte:window onpopstate=\{handleMenuPopState\}/);
	assert.match(header, /oncancel=\{handleDialogCancel\}/);
	assert.match(header, /aria-expanded=\{siteMenuOpen\}/);
	assert.match(header, /data-sveltekit-reload/);
	assert.match(header, /label: 'Saved'/);
	assert.match(header, /aria-label="Mobile photography navigation"/);
	assert.doesNotMatch(header, /<details class="open-practice-shell__mobile"/);
	assert.doesNotMatch(header, /How I work/);
});

test('retired About and Privacy routes point to their canonical owners', async () => {
	const [about, privacy, footer, sitemap] = await Promise.all([
		source('src/routes/about/+page.server.ts'),
		source('src/routes/privacy/+page.ts'),
		source('src/lib/components/layout/Footer.svelte'),
		source('src/routes/sitemap.xml/+server.ts')
	]);

	assert.match(about, /redirect\(308, '\/photography#story'\)/);
	assert.match(privacy, /redirect\(308, '\/privacy'\)/);
	assert.match(footer, /href="\/photography#story"[\s\S]*Story/);
	assert.match(footer, /href="\/photography#story"[\s\S]*data-sveltekit-reload[\s\S]*Story/);
	assert.match(footer, /href="\/privacy"[\s\S]*Privacy/);
	assert.doesNotMatch(sitemap, /`\$\{baseUrl\}\/about`/);
	assert.doesNotMatch(sitemap, /`\$\{baseUrl\}\/privacy`/);
});

test('the gallery root hands full-page navigation to the canonical landing', async () => {
	const [rootPage, rootLoad] = await Promise.all([
		source('src/routes/+page.svelte'),
		source('src/routes/+page.server.ts')
	]);
	assert.match(rootLoad, /redirect\(308, destination\.toString\(\)\)/);
	assert.match(rootLoad, /new URL\(SITE_URL\)/);
	assert.doesNotMatch(rootPage, /Recent events|Selected work|Book a shoot/);
});

test('the reachable style guide remains out of the search index', async () => {
	const styleGuide = await source('src/routes/style-guide/+page.svelte');
	assert.match(styleGuide, /<meta name="robots" content="noindex, follow"/);
});
