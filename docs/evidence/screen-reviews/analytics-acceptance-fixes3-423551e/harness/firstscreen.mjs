// Large-text gate, third pass. At the largest text sizes (a) content (the page's h1) must start inside the top half of the first phone screen, and
// (b) every navigation link must be reachable AND visibly so: either the links wrap with every one fully in view (200%), or they are one sideways row
// (312%) with an arrow showing that more is beyond the edge, and each link, once tabbed to, ends up fully in the row and clear of the fade at the edge.
// Planted failures: a tall header, a hidden arrow, and a row whose tabbed-to link ends up under the fade.
// usage: node firstscreen.mjs <outFile>
import { writeFileSync, appendFileSync } from 'node:fs';
import { require } from './gates.mjs';
const { chromium, webkit } = require('playwright');
const OUT = process.argv[2];
writeFileSync(OUT, `# first-screen and navigation-reach gate ${new Date().toISOString()}\n`);
const log = (l) => { console.log(l); appendFileSync(OUT, l + '\n'); };
const BASE = 'http://127.0.0.1:5431/photography/analytics';
const PATHS = ['/home', '/albums', '/albums/Re7kho', '/albums/Re7kho?recap=7', '/photos', '/sites', '/data', '/settings'];
const launch = { chromium: () => chromium.launch({ executablePath: '~/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell' }), webkit: () => webkit.launch() };

const measure = async () => {
	const h1 = document.querySelector('h1');
	const nav = document.querySelector('nav[aria-label="Report navigation"]');
	const wrap = nav.parentElement;
	const links = [...nav.querySelectorAll('a')];
	const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
	const rows = new Set(links.map((a) => Math.round(a.getBoundingClientRect().top)));
	const nr = () => nav.getBoundingClientRect();
	const scrolls = nav.scrollWidth > nav.clientWidth + 1;
	const arrowAfter = getComputedStyle(wrap, '::after').content;
	const arrowBefore = getComputedStyle(wrap, '::before').content;
	// Reach: focus each link in turn (what Tab does) and look at where it ends up.
	const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
	const reach = [];
	for (const a of links) {
		a.focus();
		await frame();
		const box = a.getBoundingClientRect();
		const row = nr();
		const fade = parseFloat(getComputedStyle(nav).getPropertyValue('--fade')) || 0;
		const left = nav.scrollLeft > 1 ? fade : 0;
		const right = nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 1 ? fade : 0;
		const inView = box.left >= row.left + left - 1 && box.right <= row.right - right + 1 && box.top >= 0 && box.bottom <= innerHeight && box.height > 0;
		reach.push({ name: a.textContent.trim(), inView });
	}
	document.activeElement.blur();
	nav.scrollLeft = 0;
	await frame();
	return {
		h1Top: Math.round(h1.getBoundingClientRect().top), vh: innerHeight, navRows: rows.size, scrolls,
		mode: scrolls ? 'strip' : rows.size > 1 ? 'wrap' : 'row',
		arrowAfter: arrowAfter !== 'none' && arrowAfter !== 'normal', arrowBefore: arrowBefore !== 'none' && arrowBefore !== 'normal',
		headerHeight: Math.round(document.querySelector('header.masthead').getBoundingClientRect().height),
		unreachable: reach.filter((x) => !x.inView).map((x) => x.name)
	};
};
// The strip's arrow must show at load (scrolled to its start and not to the current page; wait a frame for the page to centre itself on the current link).
const verdict = (m) => {
	const why = [];
	if (!(m.h1Top < m.vh * 0.5)) why.push(`h1 at ${m.h1Top}px of ${m.vh}`);
	if (m.unreachable.length) why.push(`not reachable in view: ${m.unreachable.join(', ')}`);
	if (m.mode === 'strip' && !(m.arrowAfter || m.arrowBefore)) why.push('a scrolling row with no arrow');
	if (m.mode === 'wrap' && m.navRows > 3) why.push(`${m.navRows} rows`);
	return why.length ? `FAIL (${why.join('; ')})` : 'PASS';
};
const inject = (css) => async (page) => page.evaluate((c) => { const s = document.createElement('style'); s.textContent = c; document.head.append(s); }, css);
const plants = [
	['a header that fills the first screen', async (page) => page.evaluate(() => { document.querySelector('header.masthead').style.minHeight = '900px'; })],
	['an arrow that is not drawn', inject('.nav-wrap::before, .nav-wrap::after { content: none !important; }')],
	['a row whose tabbed-to link ends up under the fade', inject('.masthead-links { scroll-padding-inline: 0 !important; }')]
];
let fired = 0; let planted = 0;
for (const engine of ['chromium', 'webkit']) {
	const browser = await launch[engine]();
	for (const font of ['100%', '200%', '312%']) {
		for (const path of PATHS) {
			const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, locale: 'en-US', timezoneId: 'America/Chicago' });
			await ctx.route('**/*', (r) => (['GET', 'HEAD'].includes(r.request().method()) ? r.continue() : r.abort()));
			const page = await ctx.newPage();
			await page.goto(BASE + path, { waitUntil: 'load', timeout: 90000 });
			await page.evaluate((f) => document.documentElement.style.setProperty('font-size', f, 'important'), font);
			// The row opens on the current page and draws its arrows once the page has hydrated, so the load is waited for to its end first.
			await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
			await page.waitForTimeout(800);
			const m = await page.evaluate(measure);
			const judged = font !== '100%';
			log(`${engine} ${font} ${path}: ${m.mode}, h1 top ${m.h1Top}px of ${m.vh}, nav rows ${m.navRows}, header ${m.headerHeight}px, arrow after ${m.arrowAfter} before ${m.arrowBefore}, unreachable [${m.unreachable.join(', ')}] => ${judged ? verdict(m) : 'not judged (default size)'}`);
			await ctx.close();
		}
	}
	// Forced failures, at the size where the row scrolls, on Home: each plant must turn a PASS into a FAIL.
	for (const [what, plant] of plants) {
		const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
		const page = await ctx.newPage();
		await page.goto(BASE + '/home', { waitUntil: 'load', timeout: 90000 });
		await page.evaluate(() => document.documentElement.style.setProperty('font-size', '312%', 'important'));
		await page.waitForTimeout(600);
		const clean = verdict(await page.evaluate(measure));
		await plant(page);
		await page.waitForTimeout(400);
		const after = verdict(await page.evaluate(measure));
		const ok = clean === 'PASS' && after.startsWith('FAIL');
		planted += 1; if (ok) fired += 1;
		log(`${engine} FORCED ${what}: before ${clean}; after ${after} => ${ok ? 'gate fired' : 'GATE DID NOT FIRE'}`);
		await ctx.close();
	}
	await browser.close();
}
log(`# forced failures fired: ${fired} of ${planted}`);
