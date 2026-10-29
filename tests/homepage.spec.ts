import { test, expect } from '@playwright/test';

const HOME = '/photography';
for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
	test.describe(`Photography home at ${viewport.width}px`, () => {
		test.use({ viewport });
		test('photo introduction, event discovery and return stay reachable', async ({ page }) => {
			await page.goto(HOME, { waitUntil: 'networkidle' });
			await expect(page.getByRole('heading', { name: 'Nino Chavez Photography', exact: true })).toBeAttached();
			await expect(page.locator('.photo-home .photograph:visible')).toHaveCount(viewport.width > 700 ? 14 : 12);
			await expect(page.getByRole('heading', { name: 'Selected photographs', exact: true })).toHaveCount(0);
			const search = page.getByRole('searchbox', { name: 'Event, team, or date' });
			const bounds = await search.boundingBox();
			if (viewport.height >= 800) expect(bounds!.y + bounds!.height).toBeLessThan(viewport.height);
			expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
			expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(24, 24, 24)');
			await search.fill('Chicago Point Series');
			await page.getByRole('button', { name: 'Search', exact: true }).click();
			await expect(page).toHaveURL(/\/photography\/albums\?q=Chicago\+Point\+Series/);
			await expect(page.getByRole('heading', { name: 'Events', exact: true })).toBeVisible();
			const filters = page.locator('.events-filters');
			expect(await filters.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
			for (const select of await filters.locator('select').all()) await expect(select).toBeInViewport();
			await page.getByRole('navigation', { name: 'Photography navigation', exact: true }).getByRole('link', { name: 'Photographs', exact: true }).click();
			await expect(page).toHaveURL(/\/photography\/#photographs$/);
			await expect(page.locator('.photo-home')).toBeVisible();
			const strip = page.locator('.opening:visible .filmstrip');
			const expectStripAtHeader = async () => {
				await expect.poll(() => strip.evaluate(el => Math.abs(el.getBoundingClientRect().top - document.querySelector('header')!.getBoundingClientRect().bottom))).toBeLessThan(2);
			};
			await expectStripAtHeader();
			const visitOrder = await strip.locator('.photograph').evaluateAll(photos => photos.map(photo => photo.getAttribute('href')));
			await page.getByRole('navigation', { name: 'Footer navigation', exact: true }).getByRole('link', { name: 'Photographs', exact: true }).click();
			await expectStripAtHeader();
			await expect(page.locator('#photographs')).toBeFocused();
			expect(await strip.locator('.photograph').evaluateAll(photos => photos.map(photo => photo.getAttribute('href')))).toEqual(visitOrder);
			await expect(page.getByRole('navigation', { name: 'Photography navigation', exact: true }).getByRole('link', { name: 'Saved', exact: true })).toBeVisible();
		});
		test('strip paging preserves whole frames and supports keyboard return', async ({ page }) => {
			await page.goto(HOME, { waitUntil: 'networkidle' });
			const strip = page.locator('.opening:visible .filmstrip');
			const first = strip.locator('.photograph').first();
			const image = first.locator('img');
			expect(await image.evaluate(img => Math.abs(img.clientWidth / img.clientHeight - (img as HTMLImageElement).naturalWidth / (img as HTMLImageElement).naturalHeight))).toBeLessThan(0.01);
			await page.getByRole('button', { name: 'Next photograph', exact: true }).click();
			expect(await strip.evaluate(el => el.scrollLeft)).toBeGreaterThan(100);
			await page.getByRole('button', { name: 'Previous photograph in the strip' }).click();
			await expect.poll(() => strip.evaluate(el => el.scrollLeft)).toBe(0);
			await first.focus();
			await page.keyboard.press('Tab');
			await expect(strip.locator('.photograph').nth(1)).toBeFocused();
			await page.keyboard.press('Enter');
			await expect(page.getByRole('dialog')).toBeVisible();
			await page.keyboard.press('Escape');
			await expect(strip.locator('.photograph').nth(1)).toBeFocused();
		});

		test('portfolio viewer pages with keyboard and returns focus', async ({ page }) => {
			await page.goto(HOME, { waitUntil: 'networkidle' });
			const trigger = page.locator('.opening:visible .photograph').first();
			const firstSource = await trigger.locator('img').getAttribute('src');
			const secondSource = await page.locator('.opening:visible .photograph').nth(1).locator('img').getAttribute('src');
			await trigger.click();
			const viewer = page.getByRole('dialog');
			await expect(viewer).toBeVisible();
			await expect(viewer.locator('img')).toHaveAttribute('src', firstSource!);
			await expect(viewer.locator('[aria-live]')).toHaveText(`1 / ${viewport.width > 700 ? 14 : 12}`);
			await page.keyboard.press('ArrowRight');
			await expect(viewer.locator('img')).toHaveAttribute('src', secondSource!);
			await expect(viewer.locator('[aria-live]')).toHaveText(`2 / ${viewport.width > 700 ? 14 : 12}`);
			await page.keyboard.press('ArrowLeft');
			await expect(viewer.locator('[aria-live]')).toHaveText(`1 / ${viewport.width > 700 ? 14 : 12}`);
			await viewer.getByRole('button', { name: 'Close' }).focus();
			await page.keyboard.press('Shift+Tab');
			await expect(viewer.getByRole('button', { name: 'Next' })).toBeFocused();
			await page.keyboard.press('Tab');
			await expect(viewer.getByRole('button', { name: 'Close' })).toBeFocused();
			await page.keyboard.press('Escape');
			await expect(viewer).not.toBeVisible();
			await expect(trigger).toBeFocused();
		});
	});
}

test('homepage visits vary the opening before hydration and retain every photo', async ({ page }) => {
	const starts = { desktop: new Set<string>(), mobile: new Set<string>() };
	const inventories: Record<string, string[]> = {};
	const cacheHeaders: string[] = [];
	const hydrationWarnings: string[] = [];
	page.on('console', message => { if (/hydration/i.test(message.text())) hydrationWarnings.push(message.text()); });
	for (let visit = 0; visit < 8; visit++) {
		const response = await page.goto(HOME, { waitUntil: 'networkidle' });
		cacheHeaders.push(response!.headers()['cache-control'] ?? '');
		const serverOrder = await page.evaluate(html => {
			const document = new DOMParser().parseFromString(html, 'text/html');
			return Object.fromEntries(['desktop', 'mobile'].map(device => [device,
				Array.from(document.querySelectorAll(`.opening.${device} .photograph`), photo => photo.getAttribute('href')!)]));
		}, await response!.text());
		for (const device of ['desktop', 'mobile'] as const) {
			const order = serverOrder[device];
			expect(new Set(order).size).toBe(device === 'desktop' ? 14 : 12);
			inventories[device] ??= [...order].sort();
			expect([...order].sort()).toEqual(inventories[device]);
			expect(await page.locator(`.opening.${device} .photograph`).evaluateAll(photos => photos.map(photo => photo.getAttribute('href')))).toEqual(order);
			starts[device].add(order[0]);
		}
	}
	// Random draws may repeat; only an unchanged opening across all eight visits fails.
	expect(starts.desktop.size).toBeGreaterThan(1);
	expect(starts.mobile.size).toBeGreaterThan(1);
	for (const header of cacheHeaders) expect(header).toContain('no-store');
	expect(hydrationWarnings).toEqual([]);
});

test('event search and portfolio remain usable without JavaScript', async ({ browser, baseURL }) => {
	const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
	const page = await context.newPage();
	await page.goto(HOME, { waitUntil: 'networkidle' });
	await expect(page.locator('.opening:visible img').first()).toBeVisible();
	await page.getByRole('searchbox', { name: 'Event, team, or date' }).fill('Chicago Point Series');
	await page.getByRole('button', { name: 'Search', exact: true }).click();
	await expect(page).toHaveURL(/\/photography\/albums\?q=Chicago\+Point\+Series/);
	await expect(page.getByRole('heading', { name: 'Events', exact: true })).toBeVisible();
	await context.close();
});
