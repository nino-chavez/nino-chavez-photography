import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);

async function source(path: string) {
	return readFile(new URL(path, root), 'utf8');
}

test('global navigation names Photography as the current top-level section', async () => {
	const header = await source('src/lib/components/layout/Header.svelte');
	assert.match(
		header,
		/Work'[\s\S]*How I work'[\s\S]*Learn'[\s\S]*Writing'[\s\S]*Photography'[\s\S]*About'/
	);
	assert.doesNotMatch(header, /label: 'Demos'/);
	assert.match(header, /open-practice-shell__identity[\s\S]*data-sveltekit-reload/);
	assert.match(header, /item\.href === '\/photography' \? 'location'/);
	assert.match(
		header,
		/href="\{base\}\/"[\s\S]*data-sveltekit-reload[\s\S]*aria-label="Photography home"/
	);
	assert.match(header, /label: 'Saved'/);
	assert.match(header, /<summary>Menu<\/summary>/);
	assert.doesNotMatch(header, />Site menu<\/summary>/);
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
