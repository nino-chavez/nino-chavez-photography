/** Visibility rule: a loaded card is at least 50% visible for one continuous second on a visible page. */
export function exposureEligible(ratio: number, loaded: boolean, pageVisible: boolean): boolean {
	return loaded && pageVisible && ratio >= 0.5;
}

export function exposure(node: Element, options: { loaded: boolean; onExpose: () => void }) {
	let optionsState = options;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let emitted = false;
	const clear = () => { if (timer) clearTimeout(timer); timer = undefined; };
	const evaluate = (ratio: number) => {
		clear();
		if (emitted || !exposureEligible(ratio, optionsState.loaded, document.visibilityState === 'visible')) return;
		timer = setTimeout(() => { if (!emitted && exposureEligible(ratio, optionsState.loaded, document.visibilityState === 'visible')) { emitted = true; optionsState.onExpose(); } }, 1000);
	};
	const observer = new IntersectionObserver(([entry]) => evaluate(entry.intersectionRatio), { threshold: [0, 0.5] });
	observer.observe(node);
	return { update(next: typeof options) { optionsState = next; }, destroy() { clear(); observer.disconnect(); } };
}
