// Mechanical gates for the acceptance walk. Browser-side functions are passed to page.evaluate; nothing here touches the app.
import { createRequire } from 'node:module';
export const WT = '~/Workspace/dev/sites/nino/nino-chavez-photography/.claude/worktrees/agent-a15271f0369faf0bf';
export const require = createRequire(`${WT}/package.json`);

// Overflow: every element box against the viewport AND the document must not scroll sideways.
// A box inside a focusable sideways scroller is excused only if the scroller fits and the box is clipped by it
// (an absolutely positioned box whose scroller is not its containing block escapes the clip and is not excused).
export const overflowGate = () => {
	const rendered = (el) => (typeof el.checkVisibility === 'function' ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true, opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true }) : true);
	const vw = document.documentElement.clientWidth;
	const label = (el) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/)[0] : ''}`;
	const excusedRegion = (el) => {
		const escapes = ['absolute', 'fixed'].includes(getComputedStyle(el).position);
		for (let p = el.parentElement; p; p = p.parentElement) {
			const cs = getComputedStyle(p);
			// A sideways scroller is reachable without a mouse when it takes focus itself (tabindex) or when what is inside it is focusable: the header's navigation row at the largest text sizes holds only links.
			const keyboardReachable = p.hasAttribute('tabindex') || (p.matches('nav[aria-label="Report navigation"]') && !!el.closest('a[href]'));
			if (['auto', 'scroll'].includes(cs.overflowX) && keyboardReachable) {
				const r = p.getBoundingClientRect();
				return r.left >= -0.5 && r.right <= vw + 0.5 && (!escapes || cs.position !== 'static');
			}
		}
		return false;
	};
	const bad = [];
	for (const el of document.querySelectorAll('body *')) {
		if (!rendered(el)) continue;
		const r = el.getBoundingClientRect();
		if (r.width === 0 && r.height === 0) continue;
		if ((r.left < -0.5 || r.right > vw + 0.5) && !excusedRegion(el)) bad.push(`${label(el)} spans ${Math.round(r.left)}..${Math.round(r.right)} of ${vw}`);
	}
	const sideways = document.documentElement.scrollWidth - vw;
	if (sideways > 0) bad.push(`the document scrolls sideways by ${sideways}px`);
	return { vw, scrollWidth: document.documentElement.scrollWidth, bodyScroll: document.body.scrollWidth, offenders: bad.length, sample: bad.slice(0, 12) };
};

// Targets under 44px (links, buttons, fields, summaries). Inline links inside sentences are excused and counted;
// a checkbox or radio is measured as its label; a stretched-link card is measured as the card.
export const targetGate = () => {
	const rendered = (el) => (typeof el.checkVisibility === 'function' ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true, opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true }) : true);
	const label = (el) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/)[0] : ''}`;
	const under = []; let inline = 0; let measured = 0;
	for (const el of document.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button]')) {
		const stretched = el.tagName === 'A' && getComputedStyle(el, '::after').position === 'absolute' && el.closest('li, article');
		const r = (stretched || (['checkbox', 'radio'].includes(el.type) ? el.closest('label') : null) || el).getBoundingClientRect(); const cs = getComputedStyle(el);
		if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || cs.display === 'none' || !rendered(el)) continue;
		if (el.closest('.sr-only')) continue;
		if (el.tagName === 'A' && cs.display === 'inline' && el.parentElement && (el.parentElement.textContent ?? '').trim().length > (el.textContent ?? '').trim().length + 12) { inline += 1; continue; }
		measured += 1;
		if (r.height < 43.5 || (r.width < 43.5 && el.tagName !== 'A')) under.push(`${label(el)} "${(el.textContent || el.getAttribute('aria-label') || el.getAttribute('name') || '').trim().replace(/\s+/g, ' ').slice(0, 40)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
	}
	return { measured, inline, under };
};

// Font sizes of every visible text-bearing element, in document order (used to find text that does not grow).
export const fontSizes = () => {
	const rendered = (el) => (typeof el.checkVisibility === 'function' ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true, opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true }) : true);
	const label = (el) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/)[0] : ''}`;
	const out = [];
	for (const el of document.querySelectorAll('body *')) {
		if (el.closest('.sr-only')) continue;
		let own = '';
		for (const n of el.childNodes) if (n.nodeType === 3) own += n.nodeValue;
		own = own.replace(/\s+/g, ' ').trim();
		if (!own) continue;
		const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
		if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || cs.display === 'none' || !rendered(el)) continue;
		if (['SCRIPT', 'STYLE'].includes(el.tagName)) continue;
		out.push({ label: label(el), size: parseFloat(cs.fontSize), text: own.slice(0, 40) });
	}
	return out;
};

// Text contrast from computed colours (author colours, or the forced palette when forced-colors is active).
export const contrastGate = () => {
	const rendered = (el) => (typeof el.checkVisibility === 'function' ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true, opacityProperty: true, visibilityProperty: true, contentVisibilityAuto: true }) : true);
	const label = (el) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/)[0] : ''}`;
	const cv = document.createElement('canvas'); cv.width = cv.height = 1; const cx = cv.getContext('2d', { willReadFrequently: true });
	const rgba = (str) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = str; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 }; };
	const over = (top, bottom) => { const a = top.a + bottom.a * (1 - top.a); if (a === 0) return { r: 0, g: 0, b: 0, a: 0 }; return { r: (top.r * top.a + bottom.r * bottom.a * (1 - top.a)) / a, g: (top.g * top.a + bottom.g * bottom.a * (1 - top.a)) / a, b: (top.b * top.a + bottom.b * bottom.a * (1 - top.a)) / a, a }; };
	const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
	const bgOf = (el) => {
		const stack = [];
		for (let p = el; p; p = p.parentElement) {
			const cs = getComputedStyle(p);
			if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
			const c = rgba(cs.backgroundColor);
			stack.push(c);
			if (c.a >= 0.999) break;
		}
		let acc = rgba(getComputedStyle(document.documentElement).backgroundColor); if (acc.a < 0.999) acc = over(acc, { r: 255, g: 255, b: 255, a: 1 });
		for (let i = stack.length - 1; i >= 0; i -= 1) acc = over(stack[i], acc);
		return acc;
	};
	const bad = []; let checked = 0; let skippedImage = 0;
	for (const el of document.querySelectorAll('body *')) {
		if (el.closest('.sr-only') || ['SCRIPT', 'STYLE'].includes(el.tagName)) continue;
		let own = '';
		for (const n of el.childNodes) if (n.nodeType === 3) own += n.nodeValue;
		own = own.replace(/\s+/g, ' ').trim();
		if (!own) continue;
		const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
		if (r.width === 0 || r.height === 0 || cs.visibility === 'hidden' || cs.display === 'none' || !rendered(el)) continue;
		if (el.closest(':disabled')) continue;
		const bg = bgOf(el);
		if (!bg) { skippedImage += 1; continue; }
		const isSvg = el instanceof SVGElement; if (isSvg && (cs.fill === 'none' || !cs.fill)) continue;
		let fg = rgba(isSvg ? cs.fill : cs.color); fg = over(fg, bg);
		let op = 1; for (let p = el; p; p = p.parentElement) op *= parseFloat(getComputedStyle(p).opacity);
		if (op < 1) fg = over({ ...fg, a: op }, bg);
		const l1 = lum(fg); const l2 = lum(bg); const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
		const size = parseFloat(cs.fontSize); const weight = parseInt(cs.fontWeight, 10) || 400;
		const large = size >= 24 || (size >= 18.66 && weight >= 700);
		checked += 1;
		if (ratio < (large ? 3 : 4.5)) bad.push(`${label(el)} "${own.slice(0, 32)}" ${ratio.toFixed(2)}:1 (needs ${large ? 3 : 4.5}) fg ${cs.color} bg rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`);
	}
	return { checked, skippedImage, offenders: bad.length, sample: bad.slice(0, 12) };
};

export const mediaState = () => ({
	forcedColors: matchMedia('(forced-colors: active)').matches,
	contrastMore: matchMedia('(prefers-contrast: more)').matches,
	dark: matchMedia('(prefers-color-scheme: dark)').matches,
	reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
	bodyColor: getComputedStyle(document.body).color,
	bodyBackground: getComputedStyle(document.body).backgroundColor,
	rootFontSize: getComputedStyle(document.documentElement).fontSize
});

export const focusInfo = () => {
	const el = document.activeElement; if (!el || el === document.body) return null;
	const cs = getComputedStyle(el);
	const ring = (e) => e && ((e.outlineStyle !== 'none' && parseFloat(e.outlineWidth) > 0) || (e.boxShadow && e.boxShadow !== 'none'));
	const outlineOnly = (e) => e && e.outlineStyle !== 'none' && parseFloat(e.outlineWidth) > 0;
	const ancestorRing = (fn) => { for (let a = el.parentElement, n = 0; a && n < 5; a = a.parentElement, n += 1) if (fn(getComputedStyle(a))) return true; return false; };
	const r = el.getBoundingClientRect();
	return {
		focusVisible: el.matches(':focus-visible'), outlineRaw: `${cs.outlineStyle} ${cs.outlineWidth}`,
		tag: el.tagName.toLowerCase() + (el.type ? `[type=${el.type}]` : '') + (el.name ? `[name=${el.name}]` : '') + (el.id ? `#${el.id}` : ''),
		text: (el.textContent || el.getAttribute('aria-label') || el.getAttribute('value') || '').trim().replace(/\s+/g, ' ').slice(0, 36),
		ring: ring(cs) ? `${cs.outlineStyle} ${cs.outlineWidth}${cs.outlineStyle === 'none' ? ' (box-shadow)' : ''}` : null,
		outline: outlineOnly(cs), cardRing: ancestorRing(ring), cardOutline: ancestorRing(outlineOnly),
		inView: r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth
	};
};

export async function keyboardWalk(page, { outlineOnly = false, max = 500, key = 'Tab' } = {}) {
	await page.evaluate(() => { window.scrollTo(0, 0); document.activeElement?.blur(); });
	const stops = [];
	for (let i = 0; i < max; i += 1) {
		await page.keyboard.press(key);
		const info = await page.evaluate(async (src) => { await Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))); return (0, eval)(`(${src})`)(); }, focusInfo.toString());
		if (!info) break;
		stops.push(info);
	}
	const isDate = (s) => /^input\[type=date\]/.test(s.tag);
	const noRing = stops.filter((s) => !(outlineOnly ? s.outline || s.cardOutline : s.ring || s.cardRing) && !isDate(s));
	const offscreen = stops.filter((s) => !s.inView);
	return { stops: stops.length, capped: stops.length >= max, noRing: noRing.map((s) => `${s.tag} "${s.text}"`), offscreen: offscreen.map((s) => `${s.tag} "${s.text}"`), dateStops: stops.filter(isDate).length, first: stops.slice(0, 6).map((s) => `${s.tag} "${s.text}" [${s.ring ?? 'no ring'}] focus-visible=${s.focusVisible} outline=${s.outlineRaw}`) };
}

export async function axeRun(page) {
	const AxeBuilder = require('@axe-core/playwright').default ?? require('@axe-core/playwright');
	const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
	return {
		violations: res.violations.map((v) => ({ id: v.id, impact: v.impact, count: v.nodes.length, help: v.help, targets: v.nodes.slice(0, 4).map((n) => n.target.join(' ')) })),
		incompleteContrast: res.incomplete.filter((v) => v.id === 'color-contrast').reduce((n, v) => n + v.nodes.length, 0),
		passes: res.passes.length
	};
}
