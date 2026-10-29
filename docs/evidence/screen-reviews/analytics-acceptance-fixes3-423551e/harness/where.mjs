// Prints the page y of each search text, so a capture part can be named. usage: node where.mjs <path> <role> <phone|desktop> <text%|-> <text...>
import { require } from './gates.mjs';
const { chromium } = require('playwright');
const [path, role, width, text, ...needles] = process.argv.slice(2);
const SESSION = (() => {
	const payload = Buffer.from(JSON.stringify({ sub: '00000000-0000-4000-8000-000000000042', email: 'walk-owner@example.test', role: 'authenticated', aud: 'authenticated', exp: 4102444800 })).toString('base64url');
	const token = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${payload}.walk`;
	const session = { access_token: token, refresh_token: 'walk-refresh', expires_in: 3600, expires_at: 4102444800, token_type: 'bearer', user: { id: '00000000-0000-4000-8000-000000000042', email: 'walk-owner@example.test', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '2026-01-01T00:00:00Z' } };
	return 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url');
})();
const W = width === 'phone' ? { viewport: { width: 390, height: 844 }, mobile: true } : { viewport: { width: 1440, height: 900 }, mobile: false };
const browser = await chromium.launch({ executablePath: '~/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell' });
const ctx = await browser.newContext({ viewport: W.viewport, deviceScaleFactor: 1, isMobile: W.mobile, hasTouch: W.mobile, reducedMotion: 'reduce', locale: 'en-US', timezoneId: 'America/Chicago' });
if (role === 'owner') await ctx.addCookies([{ name: 'sb-skywzpcekhntecegyjoj-auth-token', value: SESSION, url: 'http://127.0.0.1:5431/' }]);
await ctx.route('**/*', (r) => (['GET', 'HEAD'].includes(r.request().method()) ? r.continue() : r.abort()));
const page = await ctx.newPage();
await page.goto('http://127.0.0.1:5431/photography/analytics' + path, { waitUntil: 'load', timeout: 90000 });
await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
if (text !== '-') await page.evaluate((f) => document.documentElement.style.setProperty('font-size', f + '%', 'important'), text);
await page.waitForTimeout(1200);
const out = await page.evaluate((list) => list.map((n) => {
	const el = [...document.querySelectorAll('h1,h2,h3,h4,p,dt,li,summary,span,a,div')].filter((e) => e.children.length < 6 && e.textContent.includes(n) && e.getBoundingClientRect().height > 0).sort((a, b) => a.textContent.length - b.textContent.length)[0];
	return { n, y: el ? Math.round(el.getBoundingClientRect().top + scrollY) : null };
}), needles);
const height = await page.evaluate(() => document.documentElement.scrollHeight);
console.log(JSON.stringify({ path, role, width, text, height, vh: W.viewport.height, found: out.map((o) => `${o.n}@${o.y}${o.y === null ? '' : ' part ' + (Math.floor(o.y / W.viewport.height) + 1)}`) }));
await browser.close();
