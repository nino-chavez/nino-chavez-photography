import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const root = new URL('../../', import.meta.url);

async function source(path: string) {
	return readFile(new URL(path, root), 'utf8');
}

test('gallery shell uses independent photography navigation', async () => {
	const [header, footer] = await Promise.all([
		source('src/lib/components/layout/Header.svelte'),
		source('src/lib/components/layout/Footer.svelte')
	]);

	assert.match(header, /Nino Chavez Photography/);
	assert.match(header, /href=\{`\$\{base\}\/albums`\}/);
	assert.match(header, /label: 'Events'/);
	assert.match(header, /label: 'By date'/);
	assert.match(header, /label: 'Collections'/);
	assert.match(header, /label: 'Saved'/);
	assert.match(header, /aria-label="Mobile photography navigation"/);
	assert.match(header, /--gallery-header-height: 50px/);
	assert.match(header, /--gallery-header-height: 48px/);
	assert.doesNotMatch(header, /open-practice-shell|site-menu-dialog|GLOBAL_NAVIGATION|MENU_NAVIGATION/);
	assert.match(footer, /https:\/\/ninochavez\.co\/privacy/);
	assert.match(footer, /Nino Chavez profile/);
	assert.doesNotMatch(footer, /open-practice-footer|GLOBAL_NAVIGATION/);
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
	assert.match(footer, /href="https:\/\/ninochavez\.co\/privacy"[\s\S]*Privacy/);
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
