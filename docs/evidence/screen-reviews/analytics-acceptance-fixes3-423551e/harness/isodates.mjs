// S16 check: no ISO date (2026-09-29) in the words of the Data page, for both roles. A planted one must be found. usage: node isodates.mjs <outFile>
import { writeFileSync, appendFileSync } from 'node:fs';
import { require } from './gates.mjs';
const { chromium } = require('playwright');
const OUT = process.argv[2];
writeFileSync(OUT, `# iso-date check ${new Date().toISOString()}\n`);
const log = (l) => { console.log(l); appendFileSync(OUT, l + '\n'); };
const SESSION = (() => {
	const payload = Buffer.from(JSON.stringify({ sub: '00000000-0000-4000-8000-000000000042', email: 'walk-owner@example.test', role: 'authenticated', aud: 'authenticated', exp: 4102444800 })).toString('base64url');
	const token = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${payload}.walk`;
	const session = { access_token: token, refresh_token: 'walk-refresh', expires_in: 3600, expires_at: 4102444800, token_type: 'bearer', user: { id: '00000000-0000-4000-8000-000000000042', email: 'walk-owner@example.test', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '2026-01-01T00:00:00Z' } };
	return 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url');
})();
const browser = await chromium.launch({ executablePath: '~/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell' });
let hits = 0;
for (const role of ['visitor', 'owner']) {
	for (const plant of [false, true]) {
		const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US', timezoneId: 'America/Chicago' });
		if (role === 'owner') await ctx.addCookies([{ name: 'sb-skywzpcekhntecegyjoj-auth-token', value: SESSION, url: 'http://127.0.0.1:5431/' }]);
		await ctx.route('**/*', (r) => (['GET', 'HEAD'].includes(r.request().method()) ? r.continue() : r.abort()));
		const page = await ctx.newPage();
		await page.goto('http://127.0.0.1:5431/photography/analytics/data', { waitUntil: 'load', timeout: 90000 });
		await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
		await page.waitForTimeout(1500);
		if (plant) await page.evaluate(() => { const p = document.createElement('p'); p.textContent = 'Detailed event counts begin 2026-09-29.'; document.body.append(p); });
		await page.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; }));
		const text = await page.evaluate(() => document.body.innerText);
		const found = [...text.matchAll(/\b20\d{2}-\d{2}-\d{2}\b/g)].map((m) => `${m[0]} in "${text.slice(Math.max(0, m.index - 40), m.index + 30).replace(/\s+/g, ' ')}"`);
		if (!plant) hits += found.length;
		log(`${role}${plant ? ' (planted)' : ''}: ${found.length ? 'FOUND ' + found.join(' | ') : 'none'}`);
		await ctx.close();
	}
}
await browser.close();
log(`# unplanted hits: ${hits}`);
