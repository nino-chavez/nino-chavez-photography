// Nav experiment: measure candidate nav layouts at large text. usage: node nav-exp.mjs
import { require } from './gates.mjs';
const { chromium, webkit } = require('playwright');
const BASE = 'http://127.0.0.1:5431/photography/analytics';
const launch = { chromium: () => chromium.launch({ executablePath: '~/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell' }), webkit: () => webkit.launch() };
const CAND = {
	current: '',
	wrap: '.masthead{flex-wrap:wrap !important} .masthead-links{flex:1 1 100% !important;flex-wrap:wrap !important;overflow:visible !important;background:none !important}',
	wrapTight: '.masthead{flex-wrap:wrap !important;gap:.25rem !important} .masthead-links{flex:1 1 100% !important;flex-wrap:wrap !important;overflow:visible !important;background:none !important;gap:.1rem !important} .masthead-links a{min-height:44px !important;padding:0 .5rem !important}',
	wrapGrid: '.masthead{flex-wrap:wrap !important} .masthead-links{flex:1 1 100% !important;display:grid !important;grid-template-columns:repeat(2,minmax(0,1fr)) !important;overflow:visible !important;background:none !important} .masthead-links a{min-height:44px !important;padding:0 .4rem !important}'
};
const measure = () => {
	const h1 = document.querySelector('h1');
	const nav = document.querySelector('nav[aria-label="Report navigation"]');
	const links = [...nav.querySelectorAll('a')];
	const nr = nav.getBoundingClientRect();
	const vis = links.map((a) => { const r = a.getBoundingClientRect(); return r.left >= nr.left - 1 && r.right <= nr.right + 1 && r.top >= 0 && r.bottom <= innerHeight; });
	const rows = new Set(links.map((a) => Math.round(a.getBoundingClientRect().top)));
	return { h1Top: Math.round(h1.getBoundingClientRect().top), header: Math.round(document.querySelector('header.masthead').getBoundingClientRect().height), rows: rows.size, fullyVisible: vis.filter(Boolean).length, of: links.length, navW: Math.round(nr.width), scrollW: nav.scrollWidth, linkW: links.map((a) => Math.round(a.getBoundingClientRect().width)) };
};
for (const engine of ['chromium', 'webkit']) {
	const browser = await launch[engine]();
	for (const font of ['200%', '312%']) for (const [name, css] of Object.entries(CAND)) {
		const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, locale: 'en-US' });
		const page = await ctx.newPage();
		await page.goto(BASE + '/home', { waitUntil: 'load', timeout: 90000 });
		await page.evaluate(({ f, css }) => { document.documentElement.style.setProperty('font-size', f, 'important'); const s = document.createElement('style'); s.textContent = css; document.head.append(s); }, { f: font, css });
		await page.waitForTimeout(500);
		const m = await page.evaluate(measure);
		console.log(engine, font, name.padEnd(9), JSON.stringify(m));
		await ctx.close();
	}
	await browser.close();
}
