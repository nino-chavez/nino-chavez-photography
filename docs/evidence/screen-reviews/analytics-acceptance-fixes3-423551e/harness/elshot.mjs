// Screenshot the viewport at a heading. usage: node elshot.mjs <path> <heading text> <out> [text%] [owner|visitor] [chromium|webkit] [phone|desktop]
import { require } from './gates.mjs';
const { chromium, webkit } = require('playwright');
const [path, heading, out, text = '', role = 'visitor', engine = 'chromium', width = 'phone'] = process.argv.slice(2);
const SESSION = (() => {
	const payload = Buffer.from(JSON.stringify({ sub: '00000000-0000-4000-8000-000000000042', email: 'walk-owner@example.test', role: 'authenticated', aud: 'authenticated', exp: 4102444800 })).toString('base64url');
	const token = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${payload}.walk`;
	const session = { access_token: token, refresh_token: 'walk-refresh', expires_in: 3600, expires_at: 4102444800, token_type: 'bearer', user: { id: '00000000-0000-4000-8000-000000000042', email: 'walk-owner@example.test', app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '2026-01-01T00:00:00Z' } };
	return 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url');
})();
const W = width === 'phone' ? { viewport: { width: 390, height: 844 }, mobile: true } : { viewport: { width: 1440, height: 900 }, mobile: false };
const browser = engine === 'webkit' ? await webkit.launch() : await chromium.launch({ executablePath: '~/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell' });
const ctx = await browser.newContext({ viewport: W.viewport, deviceScaleFactor: 1, isMobile: engine === 'webkit' ? false : W.mobile, hasTouch: W.mobile, reducedMotion: 'reduce', locale: 'en-US', timezoneId: 'America/Chicago' });
if (role === 'owner') await ctx.addCookies([{ name: 'sb-skywzpcekhntecegyjoj-auth-token', value: SESSION, url: 'http://127.0.0.1:5431/' }]);
await ctx.route('**/*', (route) => (['GET', 'HEAD'].includes(route.request().method()) ? route.continue() : route.abort()));
const page = await ctx.newPage();
await page.goto('http://127.0.0.1:5431/photography/analytics' + path, { waitUntil: 'load', timeout: 90000 });
await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
if (text) await page.addStyleTag({ content: `html{font-size:${text}% !important}` });
await page.waitForTimeout(700);
const found = await page.evaluate((h) => { const el = [...document.querySelectorAll('h1,h2,h3')].filter((e) => e.getBoundingClientRect().height > 0).find((e) => e.textContent.includes(h)); if (!el) return false; scrollTo(0, el.getBoundingClientRect().top + scrollY - 20); return true; }, heading);
await page.waitForTimeout(300);
await page.screenshot({ path: `/private/tmp/claude-501/-Users-nino-Workspace-dev-sites-nino-nino-chavez-photography/ddb351f2-02c9-4391-86b5-2ad4de086841/scratchpad/s9/tmp5/${out}.png` });
console.log(JSON.stringify({ found }));
await browser.close();
