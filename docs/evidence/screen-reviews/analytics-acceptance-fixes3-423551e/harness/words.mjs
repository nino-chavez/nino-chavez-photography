// Rendered-words gate: the words a reader sees on every surface, for both roles, checked against the internal terms this pass removed.
// usage: node words.mjs <outFile> [--plant]
import { writeFileSync, appendFileSync } from 'node:fs';
import { require } from './gates.mjs';
const { chromium } = require('playwright');
const OUT = process.argv[2];
const PLANT = process.argv.includes('--plant');
writeFileSync(OUT, `# rendered-words gate ${new Date().toISOString()}${PLANT ? ' (planted)' : ''}\n`);
const log = (l) => { console.log(l); appendFileSync(OUT, l + '\n'); };
const ORIGIN = 'http://127.0.0.1:5431/photography/analytics';
const SURFACES = [
	{ id: 'home', visitor: '/home', owner: '/home' },
	{ id: 'albums', visitor: '/albums', owner: '/albums' },
	{ id: 'album-Re7kho', visitor: '/albums/Re7kho', owner: '/albums/Re7kho' },
	{ id: 'album-DWdCET', visitor: '/albums/DWdCET', owner: '/albums/DWdCET' },
	{ id: 'album-Re7kho-recap3', visitor: '/albums/Re7kho?recap=3', owner: '/albums/Re7kho?recap=3' },
	{ id: 'album-Re7kho-recap7', visitor: '/albums/Re7kho?recap=7', owner: '/albums/Re7kho?recap=7' },
	{ id: 'album-DWdCET-recap3', visitor: '/albums/DWdCET?recap=3', owner: '/albums/DWdCET?recap=3' },
	{ id: 'album-DWdCET-recap7', visitor: '/albums/DWdCET?recap=7', owner: '/albums/DWdCET?recap=7' },
	{ id: 'album-Re7kho-recap5', visitor: '/albums/Re7kho?recap=5', owner: '/albums/Re7kho?recap=5' },
	{ id: 'photos', visitor: '/photos', owner: '/photos' },
	{ id: 'sites', visitor: '/sites', owner: '/sites' },
	{ id: 'data', visitor: '/data', owner: '/data' },
	{ id: 'settings', visitor: '/settings', owner: '/settings' }
];
const SESSION = (() => {
	const payload = Buffer.from(JSON.stringify({ sub: '00000000-0000-4000-8000-000000000042', email: 'walk-owner@example.test', role: 'authenticated', aud: 'authenticated', exp: 4102444800 })).toString('base64url');
	const token = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${payload}.walk`;
	const session = { access_token: token, refresh_token: 'walk-refresh', expires_in: 3600, expires_at: 4102444800, token_type: 'bearer', user: { id: '00000000-0000-4000-8000-000000000042', email: 'walk-owner@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' } };
	return 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url');
})();
// Terms that must not reach a reader. Each is the whole word or phrase, any case.
const BANNED = [/collector/i, /linked[- ]journey/i, /denominator/i, /backfill/i, /grid showings/i, /\bsrc=/i, /Downloads, week/i, /event snapshot/i, /while attention is still arriving/i];
// "tagged link" is not on the list: four stored recaps written before this pass say it in their own text, which is not rewritten (the page does not claim otherwise).
const browser = await chromium.launch({ executablePath: '~/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell' });
let hits = 0; let pages = 0;
for (const role of ['visitor', 'owner']) {
	for (const width of [{ w: 390, h: 844, mobile: true }, { w: 1440, h: 900, mobile: false }]) {
		for (const surface of SURFACES) {
			const ctx = await browser.newContext({ viewport: { width: width.w, height: width.h }, isMobile: width.mobile, locale: 'en-US', timezoneId: 'America/Chicago' });
			if (role === 'owner') await ctx.addCookies([{ name: 'sb-skywzpcekhntecegyjoj-auth-token', value: SESSION, url: 'http://127.0.0.1:5431/' }]);
			await ctx.route('**/*', (r) => (['GET', 'HEAD'].includes(r.request().method()) ? r.continue() : r.abort()));
			const page = await ctx.newPage();
			await page.goto(ORIGIN + surface[role], { waitUntil: 'load', timeout: 90000 });
			await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
			await page.waitForTimeout(400);
			if (PLANT && surface.id === 'home') await page.evaluate(() => { const p = document.createElement('p'); p.textContent = 'Counted as the collector labeled each visit.'; document.body.append(p); });
			// Open every collapsed disclosure so its words are read too.
			await page.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; }));
			const text = await page.evaluate(() => [document.body.innerText, ...[...document.querySelectorAll('[aria-label],[title],[alt]')].map((e) => `${e.getAttribute('aria-label') ?? ''} ${e.getAttribute('title') ?? ''}`)].join('\n'));
			const found = BANNED.flatMap((re) => { const m = text.match(re); return m ? [`${re} -> "${text.slice(Math.max(0, m.index - 40), m.index + 60).replace(/\s+/g, ' ')}"`] : []; });
			pages += 1; hits += found.length;
			log(`${role} ${width.w} ${surface.id}: ${found.length ? 'FOUND ' + found.join(' | ') : 'clean'}`);
			await ctx.close();
		}
	}
}
await browser.close();
log(`# ${pages} loads, ${hits} hits`);
