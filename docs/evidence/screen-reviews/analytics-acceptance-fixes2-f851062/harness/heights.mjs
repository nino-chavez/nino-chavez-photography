// Page heights at default text, visitor role, Chromium. usage: node heights.mjs <origin-with-base> <label>
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const require = createRequire('~/Workspace/dev/sites/nino/nino-chavez-photography/.claude/worktrees/agent-ade1328cb3fa1ed6e/package.json');
const { chromium } = require('playwright');
const [origin, label] = process.argv.slice(2);
const pages = [['home', '/home'], ['albums', '/albums'], ['album-Re7kho', '/albums/Re7kho'], ['album-DWdCET', '/albums/DWdCET'], ['album-Re7kho-recap7', '/albums/Re7kho?recap=7'], ['album-Re7kho-recap3', '/albums/Re7kho?recap=3'], ['photos', '/photos'], ['sites', '/sites'], ['data', '/data'], ['settings', '/settings']];
const widths = { 'phone-390': { viewport: { width: 390, height: 844 }, dpr: 2, mobile: true }, 'desktop-1440': { viewport: { width: 1440, height: 900 }, dpr: 1, mobile: false } };
const browser = await chromium.launch({ executablePath: '~/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell' });
const out = [];
for (const [id, path] of pages) for (const [w, W] of Object.entries(widths)) {
	const ctx = await browser.newContext({ viewport: W.viewport, deviceScaleFactor: W.dpr, isMobile: W.mobile, hasTouch: W.mobile, reducedMotion: 'reduce', locale: 'en-US', timezoneId: 'America/Chicago' });
	const page = await ctx.newPage();
	await ctx.route('**/*', (route) => (['GET', 'HEAD'].includes(route.request().method()) ? route.continue() : route.abort()));
	await page.goto(origin + path, { waitUntil: 'load', timeout: 90000 });
	await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
	await page.waitForTimeout(500);
	const height = await page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight));
	out.push({ id, w, height });
	console.log(id, w, height);
	await ctx.close();
}
await browser.close();
writeFileSync(`/private/tmp/claude-501/-Users-nino-Workspace-dev-sites-nino-nino-chavez-photography/ddb351f2-02c9-4391-86b5-2ad4de086841/scratchpad/s9/perf3/heights-${label}.json`, JSON.stringify(out, null, 1));
