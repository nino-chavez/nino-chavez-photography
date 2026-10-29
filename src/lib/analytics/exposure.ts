/** A loaded card must stay at least half visible for one continuous second. */
export function exposureEligible(ratio: number, loaded: boolean, pageVisible: boolean): boolean {
	return loaded && pageVisible && ratio >= 0.5;
}

export function exposure(node: Element, options: { loaded: boolean; onExpose: () => void; identity?: string }) {
	let current = options;
	let ratio = 0;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let emitted = false;
	const clear = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined; };
	const eligible = () => exposureEligible(ratio, current.loaded, document.visibilityState === 'visible');
	const evaluate = () => {
		if (emitted || !eligible()) { clear(); return; }
		if (timer !== undefined) return;
		timer = setTimeout(() => {
			timer = undefined;
			if (!emitted && eligible()) { emitted = true; current.onExpose(); }
		}, 1000);
	};
	const observer = new IntersectionObserver(([entry]) => { ratio = entry.intersectionRatio; evaluate(); }, { threshold: [0, 0.5] });
	observer.observe(node);
	document.addEventListener('visibilitychange', evaluate);
	return {
		update(next: typeof options) {
			if (next.identity !== current.identity) { clear(); emitted = false; }
			current = next;
			evaluate();
		},
		destroy() { clear(); observer.disconnect(); document.removeEventListener('visibilitychange', evaluate); }
	};
}
