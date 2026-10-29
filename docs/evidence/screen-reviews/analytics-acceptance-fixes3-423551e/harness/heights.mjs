// Page heights at default text, visitor role, Chromium. usage: node heights.mjs <origin-with-base> <label>
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const require = createRequire('~/Workspace/dev/sites/nino/nino-chavez-photography/.claude/worktrees/agent-a15271f0369faf0bf/package.json');
const { chromium } = require('playwright');
const [origin, label, role = 'visitor'] = process.argv.slice(2);
const SESSION = (() => {
	const payload = Buffer.from(JSON.stringify({ sub: '00000000-0000-4000-8000-000000000042', email: 'walk-owner@example.test', role: 'authenticated', aud: 'authenticated', exp: 4102444800 })).toString('base64url');
	const token = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${payload}.walk`;
	const session = { access_token: token, refresh_token: 'walk-refresh', expires_in: 3600, expires_at: 4102444800, token_type: 'bearer', user: { id: '00000000-0000-4000-8000-000000000042', email: 'walk-owner@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' } };
	return 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url');
})();

const pages = [['home', '/home'], ['albums', '/albums'], ['album-Re7kho', '/albums/Re7kho'], ['album-DWdCET', '/albums/DWdCET'], ['album-Re7kho-recap7', '/albums/Re7kho?recap=7'], ['album-Re7kho-recap3', '/albums/Re7kho?recap=3'], ['album-DWdCET-recap3', '/albums/DWdCET?recap=3'], ['album-DWdCET-recap7', '/albums/DWdCET?recap=7'], ['photos', '/photos'], ['sites', '/sites'], ['data', '/data'], ['settings', '/settings']];
const widths = { 'phone-390': { viewport: { width: 390, height: 844 }, dpr: 2, mobile: true }, 'desktop-1440': { viewport: { width: 1440, height: 900 }, dpr: 1, mobile: false } };
const browser = await chromium.launch({ executablePath: '~/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell' });
const out = [];
for (const [id, path] of pages) for (const [w, W] of Object.entries(widths)) {
	const ctx = await browser.newContext({ viewport: W.viewport, deviceScaleFactor: W.dpr, isMobile: W.mobile, hasTouch: W.mobile, reducedMotion: 'reduce', locale: 'en-US', timezoneId: 'America/Chicago' });
	if (role === 'owner') await ctx.addCookies([{ name: 'sb-skywzpcekhntecegyjoj-auth-token', value: SESSION, url: new URL(origin).origin + '/' }]);
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
writeFileSync(`/private/tmp/claude-501/-Users-nino-Workspace-dev-sites-nino-nino-chavez-photography/ddb351f2-02c9-4391-86b5-2ad4de086841/scratchpad/s9/h5run/heights-${label}-${role}.json`, JSON.stringify(out, null, 1));
