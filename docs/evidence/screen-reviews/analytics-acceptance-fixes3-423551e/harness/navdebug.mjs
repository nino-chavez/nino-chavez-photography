import { require } from './gates.mjs';
const { chromium, webkit } = require('playwright');
const engine = process.argv[2] ?? 'chromium';
const browser = engine === 'webkit' ? await webkit.launch() : await chromium.launch({ executablePath: '~/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.goto('http://127.0.0.1:5431/photography/analytics/home', { waitUntil: 'load' });
await page.evaluate(() => document.documentElement.style.setProperty('font-size', '312%', 'important'));
await page.waitForTimeout(700);
const out = await page.evaluate(async () => {
	const nav = document.querySelector('nav[aria-label="Report navigation"]');
	const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
	const rows = [];
	const cs = getComputedStyle(nav);
	rows.push({ fade: cs.getPropertyValue('--fade'), padding: cs.scrollPaddingInline, sl: nav.scrollLeft, cw: nav.clientWidth, sw: nav.scrollWidth, nr: JSON.stringify(nav.getBoundingClientRect()) });
	for (const a of nav.querySelectorAll('a')) {
		a.focus(); await frame();
		const r = a.getBoundingClientRect(); const n = nav.getBoundingClientRect();
		rows.push({ a: a.textContent.trim(), sl: Math.round(nav.scrollLeft), left: Math.round(r.left - n.left), right: Math.round(n.right - r.right), w: Math.round(r.width), top: Math.round(r.top), bottom: Math.round(r.bottom) });
	}
	return rows;
});
for (const r of out) console.log(JSON.stringify(r));
await browser.close();
