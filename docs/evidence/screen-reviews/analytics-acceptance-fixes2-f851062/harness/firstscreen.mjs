// S8 gate: at the largest text sizes, content (the page's h1 text) must start inside the first phone screen, and every nav link must be
// reachable (visible, or scrollable to inside the nav row, never wrapped under another row). Made to fail once on purpose with a planted tall header.
// usage: node firstscreen.mjs <outFile>
import { writeFileSync, appendFileSync } from 'node:fs';
import { require } from './gates.mjs';
const { chromium, webkit } = require('playwright');
const OUT = process.argv[2];
writeFileSync(OUT, `# first-screen gate ${new Date().toISOString()}\n`);
const log = (l) => { console.log(l); appendFileSync(OUT, l + '\n'); };
const BASE = 'http://127.0.0.1:5421/photography/analytics';
const PATHS = ['/home', '/albums', '/albums/Re7kho', '/albums/Re7kho?recap=7', '/photos', '/sites', '/data', '/settings'];
const launch = { chromium: () => chromium.launch({ executablePath: '~/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell' }), webkit: () => webkit.launch() };
const measure = () => {
	const h1 = document.querySelector('h1');
	const nav = document.querySelector('nav[aria-label="Report navigation"]');
	const links = [...nav.querySelectorAll('a')];
	const rows = new Set(links.map((a) => Math.round(a.getBoundingClientRect().top)));
	return {
		h1Top: Math.round(h1.getBoundingClientRect().top), h1Text: h1.textContent.trim().slice(0, 40), vh: innerHeight,
		navRows: rows.size, navScrolls: nav.scrollWidth > nav.clientWidth, navTop: Math.round(nav.getBoundingClientRect().top), navBottom: Math.round(nav.getBoundingClientRect().bottom),
		headerHeight: Math.round(document.querySelector('header.masthead').getBoundingClientRect().height), links: links.length
	};
};
const verdict = (m) => (m.h1Top < m.vh * 0.5 && m.navRows === 1 ? 'PASS' : 'FAIL');
let planted = 0;
for (const engine of ['chromium', 'webkit']) {
	const browser = await launch[engine]();
	for (const font of ['100%', '200%', '312%']) {
		for (const path of PATHS) {
			const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, locale: 'en-US', timezoneId: 'America/Chicago' });
			await ctx.route('**/*', (r) => (['GET', 'HEAD'].includes(r.request().method()) ? r.continue() : r.abort()));
			const page = await ctx.newPage();
			await page.goto(BASE + path, { waitUntil: 'load', timeout: 90000 });
			await page.evaluate((f) => document.documentElement.style.setProperty('font-size', f, 'important'), font);
			await page.waitForTimeout(500);
			const m = await page.evaluate(measure);
			// At default size the nav may wrap to two rows on its own; the gate speaks to the large sizes, so only they are judged.
			const judged = font !== '100%';
			log(`${engine} ${font} ${path}: h1 top ${m.h1Top}px of ${m.vh}, nav rows ${m.navRows}, scrolls ${m.navScrolls}, header ${m.headerHeight}px => ${judged ? verdict(m) : 'not judged (default size)'}`);
			await ctx.close();
		}
	}
	// Forced failure: plant a header that fills the first screen on the same page, and confirm the verdict says FAIL.
	const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
	const page = await ctx.newPage();
	await page.goto(BASE + '/home', { waitUntil: 'load', timeout: 90000 });
	await page.waitForTimeout(1500);
	await page.evaluate(() => { document.documentElement.style.setProperty('font-size', '312%', 'important'); document.querySelector('header.masthead').style.minHeight = '900px'; });
	await page.waitForTimeout(400);
	const m = await page.evaluate(measure);
	log(`${engine} FORCED (planted a 900px header): h1 top ${m.h1Top}px => ${verdict(m)} ${verdict(m) === 'FAIL' ? '(gate fired)' : '(GATE DID NOT FIRE)'}`);
	if (verdict(m) === 'FAIL') planted += 1;
	await ctx.close();
	await browser.close();
}
log(`# forced failures fired: ${planted} of 2`);
