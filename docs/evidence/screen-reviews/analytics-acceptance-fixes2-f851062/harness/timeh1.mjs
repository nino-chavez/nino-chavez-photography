// Time to the page's headline and to first contentful paint, 10 cold loads per device, same throttle as measure-analytics-performance.mjs.
// usage: node timeh1.mjs <origin> <path> <outfile>
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const require = createRequire('~/Workspace/dev/sites/nino/nino-chavez-photography/.claude/worktrees/agent-ade1328cb3fa1ed6e/package.json');
const { chromium } = require('playwright');
const [origin, path, out] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '~/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell' });
const pct = (v, p) => { const s = [...v].sort((a, b) => a - b); return s[Math.max(0, Math.ceil(p * s.length) - 1)]; };
const result = [];
for (const device of ['desktop', 'mobile']) {
	const rows = [];
	for (let i = 0; i < 10; i += 1) {
		const ctx = await browser.newContext({ viewport: device === 'mobile' ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: device === 'mobile', deviceScaleFactor: 1 });
		await ctx.route('**/*', (r) => (['GET', 'HEAD'].includes(r.request().method()) ? r.continue() : r.abort()));
		const page = await ctx.newPage();
		const cdp = await ctx.newCDPSession(page);
		if (device === 'mobile') { await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 200000, uploadThroughput: 93750 }); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 }); }
		await page.addInitScript(() => {
			window.__h1 = null;
			const check = () => { const h = document.querySelector('h1'); if (h && window.__h1 === null && h.getBoundingClientRect().height > 0) window.__h1 = performance.now(); };
			new MutationObserver(check).observe(document, { childList: true, subtree: true });
			document.addEventListener('DOMContentLoaded', check);
		});
		await page.goto(origin + path, { waitUntil: 'load', timeout: 60000 });
		await page.waitForTimeout(3500);
		const m = await page.evaluate(() => ({ h1: window.__h1, fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null, end: performance.getEntriesByType('navigation')[0].responseEnd }));
		rows.push(m);
		await ctx.close();
		await new Promise((r) => setTimeout(r, 1500));
	}
	const h1 = rows.map((r) => r.h1); const fcp = rows.map((r) => r.fcp); const end = rows.map((r) => r.end);
	result.push({ device, runs: rows.length, h1: [pct(h1, .5), pct(h1, .9)], fcp: [pct(fcp, .5), pct(fcp, .9)], documentEnd: [pct(end, .5), pct(end, .9)] });
}
console.log(JSON.stringify(result));
writeFileSync(out, JSON.stringify({ origin, path, result }, null, 1));
await browser.close();
