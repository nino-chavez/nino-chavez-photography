#!/usr/bin/env node
/**
 * Fails the build when a page component emits a head tag the root layout already owns.
 *
 * WHAT THIS CATCHES. `src/routes/+layout.svelte` emits <title>, <meta name="description">,
 * <link rel="canonical">, og:* and twitter:* for every route, and its own comment has said
 * for a while that pages "must NOT emit their own, or crawlers see duplicates". Eleven page
 * components emitted a title and a description anyway. Both tags shipped, and because the
 * layout renders first, the SPECIFIC copy was the second occurrence — the one crawlers drop.
 * Ten public pages therefore advertised the identical generic site description, including
 * /explore, /albums, /collections, /timeline, the 46 month archives, and the homepage.
 *
 * Nothing errored, nothing rendered wrong on screen, and `npm run check` was green the whole
 * time. It was only visible by fetching the built pages and counting the tags — which is why
 * the rule is now mechanical instead of a comment.
 *
 * WHAT IS STILL ALLOWED in a page's <svelte:head>, deliberately:
 *   - <meta name="robots">      the layout emits none (see its comment: an unconditional
 *                               index,follow there contradicted every page-level noindex)
 *   - application/ld+json       per-page structured data, no layout equivalent
 *   - <link rel="preload">      per-page LCP hints
 * The rule is a deny-list of the five tags the layout owns, not an allow-list of head content.
 *
 * Pages supply the strings via `data.seo` from their load function; the layout resolves
 * `seo?.title ?? …`. /photo/[id] and /albums/[slug] already worked this way and were the two
 * routes that never had the bug.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROUTES = 'src/routes';
const LAYOUT = join(ROUTES, '+layout.svelte');

/**
 * Tags the root layout is the single emitter of, and which DUPLICATE in the output when a page
 * emits them too.
 *
 * `<title>` is deliberately NOT in this list. Svelte collapses multiple <title> tags to one and
 * the page's wins — verified on /photos/2025/10, which emitted its own and shipped exactly one
 * title, its own. That is why the titles were all correct while the descriptions were all wrong,
 * and forbidding <title> here would flag nine pages for something that never shipped a defect.
 * Page titles are still better set via `data.seo` (one place, next to the description); this
 * check just does not pretend that is a correctness rule.
 */
const OWNED = [
	{ name: '<meta name="description">', re: /<meta\s[^>]*name=["']description["']/ },
	{ name: '<link rel="canonical">', re: /<link\s[^>]*rel=["']canonical["']/ },
	{ name: 'og:* meta', re: /property=["']og:/ },
	{ name: 'twitter:* meta', re: /property=["']twitter:/ }
];

function pageComponents(dir) {
	const out = [];
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) out.push(...pageComponents(full));
		else if (entry === '+page.svelte') out.push(full);
	}
	return out;
}

/** The contents of every <svelte:head> block in a component. */
function headBlocks(source) {
	return [...source.matchAll(/<svelte:head>([\s\S]*?)<\/svelte:head>/g)].map((m) => m[1]);
}

const findings = [];
for (const file of pageComponents(ROUTES)) {
	const source = readFileSync(file, 'utf8');
	for (const head of headBlocks(source)) {
		for (const { name, re } of OWNED) {
			if (re.test(head)) findings.push({ file, tag: name });
		}
	}
}

// The layout must actually emit them, or this check is guarding nothing.
const layout = readFileSync(LAYOUT, 'utf8');
const missing = OWNED.filter(({ re }) => !re.test(layout)).map(({ name }) => name);
if (missing.length) {
	console.error(`\n  ${LAYOUT} no longer emits: ${missing.join(', ')}`);
	console.error('  This check assumes the layout owns them. Fix the layout or update this list.\n');
	process.exit(1);
}

if (findings.length) {
	console.error('\n  Page components emitting head tags the layout already owns:\n');
	for (const { file, tag } of findings) console.error(`    ${file}  ${tag}`);
	console.error(
		'\n  Both tags ship. The layout renders first, so the page\'s copy is the one crawlers ignore.' +
			'\n  Return the strings from the load function as `seo: { title, description }` instead;' +
			'\n  the layout resolves them. Allowed in a page head: robots, ld+json, preload.\n'
	);
	process.exit(1);
}

console.log(`check:head — ${pageComponents(ROUTES).length} page component(s), no duplicate head tags`);
