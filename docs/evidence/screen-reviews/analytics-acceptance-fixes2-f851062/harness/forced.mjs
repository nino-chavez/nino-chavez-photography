// Forced failures: every gate is made to fail once on purpose, on the local harness (never on production), per engine and width.
// usage: node forced.mjs <outFile>
import { writeFileSync, appendFileSync } from 'node:fs';
import { require, overflowGate, targetGate, fontSizes, contrastGate, keyboardWalk, axeRun } from './gates.mjs';
const { chromium, webkit } = require('playwright');
const sharp = require('sharp');
const OUT = process.argv[2];
writeFileSync(OUT, `# forced failures ${new Date().toISOString()}\n`);
const log = (l) => { console.log(l); appendFileSync(OUT, l + '\n'); };
const URL_ = 'http://127.0.0.1:5421/photography/analytics/photos';
const launch = { chromium: () => chromium.launch({ executablePath: '~/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell' }), webkit: () => webkit.launch() };
const WIDTH = { phone: { viewport: { width: 390, height: 844 }, dpr: 2 }, desktop: { viewport: { width: 1440, height: 900 }, dpr: 1 } };
const fired = (b) => (b ? 'FIRED' : 'DID NOT FIRE');

async function pixelDiff(a, b) {
	const [x, y] = await Promise.all([sharp(a).removeAlpha().raw().toBuffer({ resolveWithObject: true }), sharp(b).removeAlpha().raw().toBuffer({ resolveWithObject: true })]);
	let maxDiff = 0; let over = 0;
	for (let i = 0; i < x.data.length; i += 3) { const d = Math.max(Math.abs(x.data[i] - y.data[i]), Math.abs(x.data[i + 1] - y.data[i + 1]), Math.abs(x.data[i + 2] - y.data[i + 2])); if (d > maxDiff) maxDiff = d; if (d > 12) over += 1; }
	return { maxDiff, over };
}

for (const engine of ['chromium', 'webkit']) {
	const browser = await launch[engine]();
	for (const wkey of ['phone', 'desktop']) {
		const W = WIDTH[wkey]; const phone = wkey === 'phone';
		const tag = `${engine} ${wkey}-${W.viewport.width}`;
		const ctx = await browser.newContext({ viewport: W.viewport, deviceScaleFactor: W.dpr, isMobile: engine === 'chromium' ? phone : false, hasTouch: phone, reducedMotion: 'reduce', colorScheme: 'light' });
		await ctx.addCookies([{ name: 'sb-skywzpcekhntecegyjoj-auth-token', value: 'x', url: 'http://127.0.0.1:5421/' }]);
		const seen = []; const consoleErrors = [];
		await ctx.route('**/*', (route) => { const r = route.request(); if (!['GET', 'HEAD'].includes(r.method())) { seen.push(`${r.method()} ${new URL(r.url()).pathname}`); return route.abort(); } return route.continue(); });
		const page = await ctx.newPage();
		page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
		await page.goto(URL_, { waitUntil: 'load' }); await page.waitForLoadState('networkidle').catch(() => {});
		if (engine === 'webkit') await page.addStyleTag({ content: '::-webkit-scrollbar{display:none}' });
		await page.waitForTimeout(500);
		log(`== ${tag}`);

		// 1. Overflow: a planted box wider than the viewport.
		const base = await page.evaluate(overflowGate);
		const wide = W.viewport.width + 30;
		await page.evaluate((w) => { const d = document.createElement('div'); d.id = 'planted'; d.style.cssText = `width:${w}px;height:10px;position:relative`; document.querySelector('main, body').appendChild(d); }, wide);
		const f1 = await page.evaluate(overflowGate);
		await page.evaluate(() => document.getElementById('planted')?.remove());
		const a1 = await page.evaluate(overflowGate);
		log(`   overflow, a planted ${wide}px box: ${fired(f1.offenders > base.offenders)} (offenders ${base.offenders} -> ${f1.offenders}: ${f1.sample.slice(-2).join(' | ')}); after removing it: ${a1.offenders}`);
		// 1b. A box that escapes its scroller (absolute, scroller not its containing block).
		await page.evaluate((left) => { const box = document.createElement('div'); box.id = 'planted-escape'; box.setAttribute('tabindex', '0'); box.style.cssText = 'width:200px;overflow-x:auto;height:20px'; const inner = document.createElement('span'); inner.style.cssText = `position:absolute;left:${left}px;width:1px;height:1px;overflow:hidden`; inner.textContent = 'x'; const w = document.createElement('div'); w.style.cssText = `width:${left}px;height:10px`; w.appendChild(inner); box.appendChild(w); document.querySelector('main, body').appendChild(box); }, phone ? 900 : 1700);
		const f1b = await page.evaluate(overflowGate);
		await page.evaluate(() => document.getElementById('planted-escape')?.remove());
		log(`   overflow, a box that escapes its scroller: ${fired(f1b.offenders > base.offenders)} (${f1b.sample.slice(-1)[0] ?? ''})`);

		// 1c. Content in a closed <details> is not rendered: the gate must ignore it, and count it once the details is opened.
		await page.evaluate((w) => { const d = document.createElement('details'); d.id = 'planted-details'; const sm = document.createElement('summary'); sm.textContent = 'planted summary'; const box = document.createElement('div'); box.style.cssText = `width:${w}px;height:10px;position:relative`; box.textContent = 'planted wide hidden box'; d.append(sm, box); document.querySelector('main, body').appendChild(d); }, W.viewport.width + 200);
		const closedD = await page.evaluate(overflowGate);
		await page.evaluate(() => { document.getElementById('planted-details').open = true; }); await page.waitForTimeout(150);
		const openD = await page.evaluate(overflowGate);
		await page.evaluate(() => document.getElementById('planted-details')?.remove());
		log(`   overflow, a wide box inside a closed <details>: ${closedD.offenders > base.offenders ? 'COUNTED (hidden content is not excluded)' : 'not counted, as intended (content in a closed details is not rendered)'}; after opening the details: ${fired(openD.offenders > base.offenders)} (offenders ${base.offenders} -> closed ${closedD.offenders} -> open ${openD.offenders})`);

		// 2. Targets: a planted 20px button.
		await page.evaluate(() => { const b = document.createElement('button'); b.id = 'planted-btn'; b.textContent = 'x'; b.style.cssText = 'width:20px;height:20px;padding:0'; document.querySelector('main, body').appendChild(b); });
		const t = await page.evaluate(targetGate);
		await page.evaluate(() => document.getElementById('planted-btn')?.remove());
		log(`   44px targets, a planted 20px button: ${fired(t.under.some((u) => u.includes('20x20')))} (${t.under.filter((u) => u.includes('20x20')).join('; ')})`);

		// 3. Text at 200%: a box that fits at 100% and overflows at 200%; and px-pinned text that does not grow.
		const remW = phone ? 14 : 46;
		await page.evaluate((r) => { const d = document.createElement('div'); d.id = 'planted-rem'; d.style.cssText = `width:${r}rem;height:10px;position:relative`; document.querySelector('main, body').appendChild(d); const p = document.createElement('p'); p.id = 'planted-px'; p.textContent = 'planted px text'; p.style.cssText = 'font-size:14px'; document.querySelector('main, body').appendChild(p); }, remW);
		const fit = await page.evaluate(overflowGate);
		const before = await page.evaluate(fontSizes);
		await page.evaluate(() => document.documentElement.style.setProperty('font-size', '200%', 'important'));
		await page.waitForTimeout(150);
		const grown = await page.evaluate(overflowGate);
		const after = await page.evaluate(fontSizes);
		await page.evaluate(() => document.documentElement.style.removeProperty('font-size'));
		const key = (f) => `${f.label}|${f.text}`; const bmap = new Map(before.map((f) => [key(f), f.size])); const pinned = after.filter((a) => bmap.get(key(a)) && a.size / bmap.get(key(a)) < 1.4);
		log(`   text at 200%, a planted ${remW}rem box: ${fired(grown.offenders > fit.offenders)} (offenders at 100% ${fit.offenders}, at 200% ${grown.offenders}: ${grown.sample.slice(-1)[0] ?? ''})`);
		log(`   text at 200%, planted 14px text that does not grow: ${fired(pinned.some((p) => p.text.includes('planted px')))} (listed: ${pinned.filter((p) => p.text.includes('planted px')).map((p) => `${p.label} ${p.size}px`).join('; ')})`);
		await page.evaluate(() => { document.getElementById('planted-rem')?.remove(); document.getElementById('planted-px')?.remove(); });

		// 4. Keyboard: a button with its outline removed, found by the Tab walk.
		await page.evaluate(() => { const b = document.createElement('button'); b.id = 'planted-ring'; b.textContent = 'ringless'; b.style.cssText = 'outline:none;box-shadow:none;min-height:44px;min-width:44px'; const first = document.querySelector('main a, body a'); first?.parentElement?.insertBefore(b, first); });
		const kb = await keyboardWalk(page, { key: engine === 'webkit' ? 'Alt+Tab' : 'Tab' });
		await page.evaluate(() => document.getElementById('planted-ring')?.remove());
		log(`   keyboard, a planted button with no focus ring: ${fired(kb.noRing.some((s) => s.includes('ringless')))} (${kb.stops} stops, listed: ${kb.noRing.filter((s) => s.includes('ringless')).join('; ')})`);

		// 5. axe: an image with no alternative text, and a low-contrast pair.
		await page.evaluate(() => { const i = document.createElement('img'); i.id = 'planted-img'; i.src = 'data:image/gif;base64,R0lGODlhAQABAAAAACw='; i.width = 10; i.height = 10; document.body.appendChild(i); const p = document.createElement('p'); p.id = 'planted-low'; p.textContent = 'planted low contrast text'; p.style.cssText = 'color:#8a8a8a;background:#999;padding:8px'; document.body.appendChild(p); });
		const ax = await axeRun(page);
		log(`   axe, a planted image with no alt text and a planted low-contrast pair: image-alt ${fired(ax.violations.some((v) => v.id === 'image-alt'))}; color-contrast ${fired(ax.violations.some((v) => v.id === 'color-contrast'))}`);

		// 6. Contrast gate (own computation), default, increased contrast, forced colours.
		const c0 = await page.evaluate(contrastGate);
		log(`   contrast gate, default colours, planted pair #8a8a8a on #999: ${fired(c0.sample.some((s) => s.includes('planted low contrast')))} (${c0.sample.filter((s) => s.includes('planted low')).join('; ')})`);
		await page.emulateMedia({ forcedColors: 'none', contrast: 'more', colorScheme: 'light' }); await page.waitForTimeout(150);
		const c1 = await page.evaluate(contrastGate);
		log(`   contrast gate, prefers-contrast: more, same planted pair: ${fired(c1.sample.some((s) => s.includes('planted low contrast')))}`);
		if (engine === 'chromium') {
			await page.evaluate(() => { const p = document.getElementById('planted-low'); p.style.setProperty('forced-color-adjust', 'none'); });
			await page.emulateMedia({ forcedColors: 'active', contrast: 'no-preference', colorScheme: 'light' }); await page.waitForTimeout(150);
			const c2 = await page.evaluate(contrastGate);
			const axf = await axeRun(page);
			log(`   contrast gate, forced-colors: active, planted pair kept out of the forced palette (forced-color-adjust: none): ${fired(c2.sample.some((s) => s.includes('planted low contrast')))}; axe color-contrast on the same page ${fired(axf.violations.some((v) => v.id === 'color-contrast'))}`);
		} else log('   contrast gate, forced-colors: not run in WebKit (the media query matches but WebKit does not apply a forced palette)');
		await page.emulateMedia({ forcedColors: 'none', contrast: 'no-preference', colorScheme: 'light' });
		await page.evaluate(() => { document.getElementById('planted-img')?.remove(); document.getElementById('planted-low')?.remove(); });

		// 7. Console errors.
		const n0 = consoleErrors.length; await page.evaluate(() => console.error('forced gate error')); await page.waitForTimeout(150);
		log(`   console errors, a planted console.error: ${fired(consoleErrors.length > n0)}`);

		// 8. Non-GET requests: a planted POST (aborted by the harness before it leaves the browser).
		const s0 = seen.length; await page.evaluate(() => fetch('/photography/analytics/photos?/forcedGate', { method: 'POST', body: new FormData() }).catch(() => {})); await page.waitForTimeout(300);
		log(`   non-GET requests, a planted POST: ${fired(seen.length > s0)} (${seen.slice(s0).join(', ')}; aborted in the browser, never sent)`);
		await ctx.close();
	}

	// 9. Capture method: a tall page. The old method (fullPage + clip) against the viewport-part method.
	for (const wkey of ['phone']) {
		const W = WIDTH[wkey];
		const ctx = await browser.newContext({ viewport: W.viewport, deviceScaleFactor: W.dpr, isMobile: false, hasTouch: true });
		const page = await ctx.newPage();
		const bands = Array.from({ length: 200 }, (_, i) => `<div style="height:100px;background:hsl(${(i * 37) % 360} 70% ${30 + (i % 5) * 8}%);color:#fff;font:700 40px sans-serif">band ${i}</div>`).join('');
		await page.setContent(`<body style="margin:0">${bands}</body>`);
		if (engine === 'webkit') await page.addStyleTag({ content: '::-webkit-scrollbar{display:none}' });
		const vh = W.viewport.height; const y = 9000;
		const oldTop = await page.screenshot({ type: 'png', fullPage: true, clip: { x: 0, y: 0, width: 390, height: vh } }).catch((e) => String(e));
		const oldDeep = await page.screenshot({ type: 'png', fullPage: true, clip: { x: 0, y, width: 390, height: vh } }).catch((e) => String(e));
		await page.evaluate((yy) => window.scrollTo(0, yy), y); await page.waitForTimeout(150);
		const part = await page.screenshot({ type: 'png' });
		if (typeof oldTop !== 'string' && typeof oldDeep !== 'string') {
			const same = await pixelDiff(oldDeep, oldTop); const cmp = await pixelDiff(oldDeep, part); const good = await pixelDiff(part, oldTop);
			log(`== ${engine} capture method on a 20,000 CSS px page at 2x (${20000 * 2} device px, over the 16,384 limit)`);
			log(`   old method (fullPage + clip at y=${y}) against the top of the page: pixels over 12 = ${same.over} (${same.over === 0 ? 'REPEATS THE TOP: the old method is wrong past the limit' : 'differs from the top'}); against the true render at y=${y} (viewport screenshot after scrolling): pixels over 12 = ${cmp.over}`);
			log(`   new method (scroll, viewport screenshot) at y=${y} against the top: pixels over 12 = ${good.over} (${good.over > 0 ? 'differs from the top, as it should' : 'SAME AS TOP: the new method is wrong too'})`);
		} else log(`== ${engine} capture method: the old method refused: ${typeof oldDeep === 'string' ? oldDeep.slice(0, 200) : ''}`);
		// A whole-page screenshot of the same page (no clip): compare the regions at y=9000 and at the bottom with the true render.
		const whole = await page.screenshot({ type: 'png', fullPage: true }).catch((e) => String(e));
		if (typeof whole !== 'string') {
			const meta = await sharp(whole).metadata();
			const region = async (top) => sharp(whole).extract({ left: 0, top: Math.min(top * 2, meta.height - vh * 2), width: 780, height: vh * 2 }).png().toBuffer();
			const bottomTrue = await (async () => { await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await page.waitForTimeout(150); return page.screenshot({ type: 'png' }); })();
			const dMid = await pixelDiff(await region(y), part); const dBot = await pixelDiff(await region(20000 - vh), bottomTrue); const dTop = await pixelDiff(await region(0), oldTop);
			log(`   whole-page screenshot (no clip), image ${meta.width}x${meta.height} device px: top region vs true top: pixels over 12 = ${dTop.over}; region at y=${y} vs true render: ${dMid.over}; bottom region vs true bottom: ${dBot.over}`);
		}
		// The checks must be able to fail. A planted wrong capture: the first part stored again as the last part.
		const dup = await pixelDiff(oldTop, oldTop);
		log(`   last part equals the first part (planted: part 1 stored as the last part): ${fired(dup.over === 0)} (pixels over 12 = ${dup.over})`);
		// The last-part assertion must be able to fail: stop one part short of the bottom.
		const h = await page.evaluate(() => document.documentElement.scrollHeight); const n = Math.ceil(h / vh);
		await page.evaluate((yy) => window.scrollTo(0, yy), (n - 2) * vh); await page.waitForTimeout(100);
		const short = await page.evaluate(() => ({ bottom: Math.round(scrollY + innerHeight), sh: document.documentElement.scrollHeight }));
		await page.evaluate((yy) => window.scrollTo(0, yy), Math.min((n - 1) * vh, h - vh)); await page.waitForTimeout(100);
		const full = await page.evaluate(() => ({ bottom: Math.round(scrollY + innerHeight), sh: document.documentElement.scrollHeight }));
		log(`   last-part check, stopping one part short (part ${n - 1} of ${n}): bottom ${short.bottom} vs height ${short.sh}: ${fired(short.bottom < short.sh - 1)}; at the real last part: bottom ${full.bottom} vs ${full.sh}: ${full.bottom >= full.sh - 1 ? 'passes' : 'FAILS'}`);
		await ctx.close();
	}
	await browser.close();
}
log('# done');
