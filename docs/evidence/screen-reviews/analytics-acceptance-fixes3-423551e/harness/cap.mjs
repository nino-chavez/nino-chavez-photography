// Acceptance capture + gate run (build step 9). Uncommitted harness.
// Step 9 fix pass: both roles run against this worktree's vite dev server (reading production Supabase, read-only through preload.mjs).
// usage: node cap.mjs <chromium|webkit> <visitor|owner> <runDir> [surfaceFilter] [widths]
//   visitor: production, plain GETs (every non-GET and every request to another *.ninochavez.co host is aborted and counted)
//   owner:   this worktree's vite dev server on production data, read-only through preload.mjs, harness owner
import { mkdirSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { require, overflowGate, targetGate, fontSizes, contrastGate, mediaState, keyboardWalk, axeRun } from './gates.mjs';
const { chromium, webkit } = require('playwright');
const sharp = require('sharp');

const S = '/private/tmp/claude-501/-Users-nino-Workspace-dev-sites-nino-nino-chavez-photography/ddb351f2-02c9-4391-86b5-2ad4de086841/scratchpad/s9';
const [engine, role, RUNNAME, FILTER = '', WIDTHS = 'phone,desktop'] = process.argv.slice(2);
const RUN = `${S}/${RUNNAME}`;
const CAP = `${RUN}/captures`; const MECH = `${RUN}/mech`;
mkdirSync(CAP, { recursive: true }); mkdirSync(MECH, { recursive: true });
const Q = Number(process.env.JPEG_Q ?? 58);
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
const SETTINGS = [
	{ id: 'default', media: { forcedColors: 'none', contrast: 'no-preference', colorScheme: 'light' }, font: null },
	{ id: 'contrast-more', media: { forcedColors: 'none', contrast: 'more', colorScheme: 'light' }, font: null },
	{ id: 'text-200', media: { forcedColors: 'none', contrast: 'no-preference', colorScheme: 'light' }, font: '200%', phoneOnly: true },
	{ id: 'text-312', media: { forcedColors: 'none', contrast: 'no-preference', colorScheme: 'light' }, font: '312%', phoneOnly: true },
	{ id: 'forced-colors', media: { forcedColors: 'active', contrast: 'no-preference', colorScheme: 'light' }, font: null }
];
const WIDTH = { phone: { label: 'phone-390', viewport: { width: 390, height: 844 }, dpr: 2, mobile: true }, desktop: { label: 'desktop-1440', viewport: { width: 1440, height: 900 }, dpr: 1, mobile: false } };

const SESSION = (() => {
	const payload = Buffer.from(JSON.stringify({ sub: '00000000-0000-4000-8000-000000000042', email: 'walk-owner@example.test', role: 'authenticated', aud: 'authenticated', exp: 4102444800 })).toString('base64url');
	const token = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${payload}.walk`;
	const session = { access_token: token, refresh_token: 'walk-refresh', expires_in: 3600, expires_at: 4102444800, token_type: 'bearer', user: { id: '00000000-0000-4000-8000-000000000042', email: 'walk-owner@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' } };
	return 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url');
})();

async function pixelDiff(a, b) {
	const [x, y] = await Promise.all([sharp(a).removeAlpha().raw().toBuffer({ resolveWithObject: true }), sharp(b).removeAlpha().raw().toBuffer({ resolveWithObject: true })]);
	if (x.info.width !== y.info.width || x.info.height !== y.info.height) return { maxDiff: 255, over12: x.info.width * x.info.height, total: x.info.width * x.info.height };
	let maxDiff = 0; let over12 = 0; const n = x.data.length;
	for (let i = 0; i < n; i += 3) { const d = Math.max(Math.abs(x.data[i] - y.data[i]), Math.abs(x.data[i + 1] - y.data[i + 1]), Math.abs(x.data[i + 2] - y.data[i + 2])); if (d > maxDiff) maxDiff = d; if (d > 12) over12 += 1; }
	return { maxDiff, over12, total: x.info.width * x.info.height };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (b) => createHash('sha1').update(b).digest('hex').slice(0, 12);
const browser = engine === 'webkit' ? await webkit.launch() : await chromium.launch({ executablePath: '~/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell' });
const engineVersion = `${engine} ${browser.version()}`;
const log = (l) => { console.log(l); appendFileSync(`${RUN}/run.log`, l + '\n'); };
log(`# ${new Date().toISOString()} ${engineVersion} role=${role} origin=${ORIGIN} q=${Q}`);

async function settle(page) { await page.waitForTimeout(250); await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); }

async function shoot(page, vh) {
	const height = () => page.evaluate(() => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight));
	const h = await height(); const n = Math.max(1, Math.ceil(h / vh)); const parts = [];
	let pos = null;
	for (let i = 0; i < n; i += 1) {
		const y = Math.min(i * vh, Math.max(0, h - vh));
		await page.evaluate((yy) => window.scrollTo(0, yy), y); await page.waitForTimeout(90);
		pos = await page.evaluate(() => ({ y: Math.round(scrollY), bottom: Math.round(scrollY + innerHeight), sh: document.documentElement.scrollHeight }));
		const buf = await page.screenshot({ type: 'png' });
		parts.push({ i, y: pos.y, hash: sha(buf), buf });
	}
	// The page can grow while it is scrolled (late images, charts): keep adding parts until the last one really is the bottom.
	for (let guard = 0; guard < 6 && pos.bottom < pos.sh - 1; guard += 1) {
		await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await page.waitForTimeout(250);
		pos = await page.evaluate(() => ({ y: Math.round(scrollY), bottom: Math.round(scrollY + innerHeight), sh: document.documentElement.scrollHeight }));
		const buf = await page.screenshot({ type: 'png' });
		parts.push({ i: parts.length, y: pos.y, hash: sha(buf), buf });
	}
	const lastAtBottom = pos.bottom >= pos.sh - 1;
	const lastDiffers = () => parts.length === 1 || parts[parts.length - 1].hash !== parts[0].hash;
	await page.evaluate(() => window.scrollTo(0, 0));
	return { height: pos.sh, vh, n: parts.length, parts, lastAtBottom, lastDiffers: lastDiffers(), lastScrollBottom: pos.bottom, lastScrollHeight: pos.sh };
}

async function runLoad(surface, wkey) {
	const W = WIDTH[wkey];
	const path = surface[role];
	const url = ORIGIN + path;
	const ctx = await browser.newContext({ viewport: W.viewport, deviceScaleFactor: W.dpr, isMobile: engine === 'webkit' ? false : W.mobile, hasTouch: W.mobile, reducedMotion: 'reduce', colorScheme: 'light', locale: 'en-US', timezoneId: 'America/Chicago' });
	if (role === 'owner') await ctx.addCookies([{ name: 'sb-skywzpcekhntecegyjoj-auth-token', value: SESSION, url: 'http://127.0.0.1:5431/' }]);
	const rec = { surface: surface.id, role, engine: engineVersion, width: W.label, url, requests: { total: 0, methods: {}, hosts: {} }, blockedNonGet: [], blockedHost: [], console: [], pageErrors: [], failed: [], badStatus: [], settings: {}, gates: {} };
	const aborted = new Set();
	await ctx.route('**/*', (route) => {
		const req = route.request(); const u = new URL(req.url()); const method = req.method();
		rec.requests.total += 1; rec.requests.methods[method] = (rec.requests.methods[method] ?? 0) + 1; rec.requests.hosts[u.hostname] = (rec.requests.hosts[u.hostname] ?? 0) + 1;
		if (/\.ninochavez\.co$/.test(u.hostname) && u.hostname !== 'analytics.ninochavez.co') { rec.blockedHost.push(`${method} ${u.hostname}${u.pathname}`); aborted.add(req.url()); return route.abort(); }
		if (!['GET', 'HEAD'].includes(method)) { rec.blockedNonGet.push(`${method} ${u.hostname}${u.pathname}`); aborted.add(req.url()); return route.abort(); }
		if (req.isNavigationRequest() && u.origin !== new URL(ORIGIN).origin) { rec.blockedHost.push(`NAVIGATE ${u.hostname}${u.pathname}`); aborted.add(req.url()); return route.abort(); }
		return route.continue();
	});
	const page = await ctx.newPage();
	page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) rec.console.push(`${m.type()}: ${m.text().slice(0, 240)} @ ${m.location().url?.slice(0, 120) ?? ''}`); });
	page.on('pageerror', (e) => rec.pageErrors.push(String(e).slice(0, 240)));
	page.on('requestfailed', (r) => { if (!aborted.has(r.url())) rec.failed.push(`${r.method()} ${r.url().slice(0, 140)} ${r.failure()?.errorText ?? ''}`); });
	page.on('response', (r) => { if (r.status() >= 400) rec.badStatus.push(`${r.status()} ${r.request().method()} ${r.url().slice(0, 140)}`); });

	const t0 = Date.now();
	const resp = await page.goto(url, { waitUntil: 'load', timeout: 90000 });
	await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
	if (engine === 'webkit') await page.addStyleTag({ content: '::-webkit-scrollbar{display:none}' });
	rec.capturedAt = new Date().toISOString();
	rec.chicagoDate = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' });
	rec.status = resp?.status(); rec.finalUrl = page.url(); rec.loadMs = Date.now() - t0;
	rec.layout = await page.evaluate(() => ({ innerWidth, clientWidth: document.documentElement.clientWidth, innerHeight, clientHeight: document.documentElement.clientHeight, dpr: devicePixelRatio, ua: navigator.userAgent }));
	rec.title = await page.title(); rec.h1 = await page.evaluate(() => [...document.querySelectorAll('h1')].map((h) => h.textContent.trim().replace(/\s+/g, ' ').slice(0, 80)));
	// Trigger lazy content once, then return to the top.
	await page.evaluate(async () => { const h = document.documentElement.scrollHeight; for (let y = 0; y < h; y += Math.round(innerHeight * 0.8)) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); } scrollTo(0, 0); });
	await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
	await page.waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 10000 }).catch(() => {});
	rec.images = await page.evaluate(() => ({ total: document.images.length, incomplete: [...document.images].filter((i) => !i.complete).length, broken: [...document.images].filter((i) => i.complete && i.naturalWidth === 0).length }));
	if (rec.status !== 200 || /report unavailable|something went wrong|internal error/i.test(await page.evaluate(() => document.body.innerText))) rec.suspect = await page.evaluate(() => document.body.innerText.slice(0, 300));
	log(`== ${surface.id} ${role} ${engineVersion.split(' ')[0]} ${W.label}: HTTP ${rec.status} ${rec.finalUrl} ${rec.loadMs}ms; images ${rec.images.total} (incomplete ${rec.images.incomplete}, broken ${rec.images.broken})`);

	let defaultParts = null; let defaultFonts = null;
	const doSetting = async (st) => {
		if (st.phoneOnly && wkey !== 'phone') return;
		const info = { files: [], identicalToDefault: null, capturedAt: new Date().toISOString() };
		try {
			await page.emulateMedia(st.media);
			await page.evaluate((f) => { const s = document.documentElement.style; if (f) s.setProperty('font-size', f, 'important'); else s.removeProperty('font-size'); }, st.font);
			await settle(page);
			info.media = await page.evaluate(mediaState);
			const sh = await shoot(page, W.viewport.height);
			info.height = sh.height; info.parts = sh.n; info.lastAtBottom = sh.lastAtBottom; info.lastDiffersFromFirst = sh.lastDiffers; info.lastScrollBottom = sh.lastScrollBottom; info.lastScrollHeight = sh.lastScrollHeight;
			info.partOffsets = sh.parts.map((p) => p.y);
			if (st.id === 'default') defaultParts = sh.parts;
			// Identical to default = same number of parts and at most 0.02% of pixels differ by more than 12 in any channel (image decoding noise is a handful of pixels).
			let same = false; let diff = null;
			if (st.id !== 'default' && defaultParts && defaultParts.length === sh.parts.length) {
				let maxDiff = 0; let over = 0; let total = 0;
				for (let i = 0; i < sh.parts.length; i += 1) { const d = await pixelDiff(defaultParts[i].buf, sh.parts[i].buf); maxDiff = Math.max(maxDiff, d.maxDiff); over += d.over12; total += d.total; }
				diff = { maxDiff, pixelsOver12: over, pixelsCompared: total }; same = over <= total * 0.0002;
			}
			info.identicalToDefault = st.id === 'default' ? null : same; info.diffFromDefault = diff;
			// Forced colours in WebKit: the media query matches but the UA does not apply its palette; label what was actually emulated.
			let fileSetting = st.id;
			if (engine === 'webkit' && st.id === 'forced-colors') fileSetting = 'forced-colors-query-only';
			const oneX = wkey === 'phone' && st.id !== 'default'; // every phone setting except the default is stored at 1x to keep the folder small
			const write = !same && !(st.id === 'text-312' && engine !== 'webkit');
			info.captured = write;
			if (write) {
				for (const p of sh.parts) {
					const f = `${surface.id}__${role}__${engine}__${W.label}__${fileSetting}__p${String(p.i + 1).padStart(2, '0')}of${sh.n}.jpg`;
					let img = sharp(p.buf); if (oneX) img = img.resize({ width: W.viewport.width });
					writeFileSync(`${CAP}/${f}`, await img.jpeg({ quality: wkey === 'desktop' ? Q - 6 : Q, mozjpeg: true }).toBuffer()); info.files.push(f);
				}
			}
			// Gates for this setting.
			const g = {};
			g.overflow = await page.evaluate(overflowGate);
			if (st.id === 'default') {
				g.targets = await page.evaluate(targetGate);
				defaultFonts = await page.evaluate(fontSizes);
			}
			if (st.font) {
				const after = await page.evaluate(fontSizes);
				const before = new Map(); for (const f of defaultFonts) before.set(`${f.label}|${f.text}`, f.size);
				const want = st.font === '200%' ? 2 : 3.12; const pinned = new Map(); let compared = 0;
				for (const a of after) { const b = before.get(`${a.label}|${a.text}`); if (!b) continue; compared += 1; if (a.size / b < want * 0.7) { const key = `${a.label} ${b}px->${a.size}px`; const e = pinned.get(key) ?? { n: 0, sample: a.text }; e.n += 1; pinned.set(key, e); } }
				g.notGrown = { compared, groups: [...pinned].map(([k, v]) => `${k} x${v.n} e.g. "${v.sample}"`) };
			}
			if (['default', 'contrast-more'].includes(st.id) || (st.id === 'forced-colors' && engine === 'chromium')) {
				g.contrast = await page.evaluate(contrastGate);
				g.axe = await axeRun(page);
			}
			info.gates = g;
		} catch (e) { info.error = String(e).slice(0, 300); log(`!! ${surface.id} ${W.label} ${st.id}: ${info.error}`); }
		rec.settings[st.id] = info;
		log(`   ${st.id}: height ${info.height} parts ${info.parts} files ${info.files.length}${info.identicalToDefault ? ' (identical to default)' : ''} bottom ${info.lastAtBottom} lastDiffers ${info.lastDiffersFromFirst} overflow ${info.gates?.overflow?.offenders}`);
	};
	for (const st of SETTINGS.filter((x) => x.id !== 'forced-colors')) await doSetting(st);
	// Keyboard (Tab only), default colours; then the forced-colours setting last (WebKit does not fully return to the default render after forced-colors is switched off); then forced-colours keyboard (outline only: forced colours drops box-shadow).
	try {
		await page.emulateMedia(SETTINGS[0].media); await page.evaluate(() => document.documentElement.style.removeProperty('font-size')); await settle(page);
		rec.gates.keyboard = await keyboardWalk(page, { outlineOnly: false });
		if (engine === 'webkit') rec.gates.keyboardAltTab = await keyboardWalk(page, { outlineOnly: false, key: 'Alt+Tab' });
	} catch (e) { rec.gates.keyboardError = String(e).slice(0, 200); }
	await doSetting(SETTINGS.find((x) => x.id === 'forced-colors'));
	try {
		if (engine === 'chromium') { await page.emulateMedia(SETTINGS.find((x) => x.id === 'forced-colors').media); await settle(page); rec.gates.keyboardForced = await keyboardWalk(page, { outlineOnly: true }); }
		log(`   keyboard: ${rec.gates.keyboard?.stops} stops, no ring: ${rec.gates.keyboard?.noRing.length}${rec.gates.keyboardAltTab ? `; Alt+Tab ${rec.gates.keyboardAltTab.stops} stops, no ring: ${rec.gates.keyboardAltTab.noRing.length}` : ''}${rec.gates.keyboardForced ? `; forced ${rec.gates.keyboardForced.stops} stops, no outline: ${rec.gates.keyboardForced.noRing.length}` : ''}`);
	} catch (e) { rec.gates.keyboardError = String(e).slice(0, 200); }
	log(`   requests ${rec.requests.total} ${JSON.stringify(rec.requests.methods)}; blocked non-GET ${rec.blockedNonGet.length}; blocked other host ${rec.blockedHost.length}; console ${rec.console.length}; pageerrors ${rec.pageErrors.length}; failed ${rec.failed.length}; >=400 ${rec.badStatus.length}`);
	const abortedPrefixes = [...aborted].map((u) => u.slice(0, 100));
	rec.consoleFromAbortedRequests = rec.console.filter((c) => /Failed to load resource/.test(c) && [...aborted].some((u) => { const loc = (c.split(' @ ')[1] ?? '').trim(); return loc.length > 20 && u.startsWith(loc); })); rec.console = rec.console.filter((c) => !rec.consoleFromAbortedRequests.includes(c));
	appendFileSync(`${MECH}/${role}-${engine}.jsonl`, JSON.stringify(rec) + '\n');
	await ctx.close();
}

for (const surface of SURFACES.filter((s) => s.id.includes(FILTER))) {
	for (const wkey of WIDTHS.split(',')) {
		try { await runLoad(surface, wkey); } catch (e) { log(`!! ${surface.id} ${wkey} failed: ${String(e).slice(0, 300)}`); }
		await sleep(role === 'visitor' ? 2500 : 300);
	}
}
await browser.close();
log('# done');
