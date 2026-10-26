import { test, expect } from '@playwright/test';

const HOME = '/photography';
for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
	test.describe(`Photography home at ${viewport.width}px`, () => {
		test.use({ viewport });
		test('photo introduction, event discovery and return stay reachable', async ({ page }) => {
			await page.goto(HOME, { waitUntil: 'networkidle' });
			await expect(page.getByRole('heading', { name: 'Nino Chavez Photography', exact: true })).toBeAttached();
			await expect(page.locator('.opening:visible .photograph')).toHaveCount(viewport.width > 700 ? 14 : 12);
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
			await page.getByRole('link', { name: 'Nino Chavez Photography home', exact: true }).click();
			await expect(page.locator('.photo-home')).toBeVisible();
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
			await trigger.click();
			const viewer = page.getByRole('dialog');
			await expect(viewer).toBeVisible();
			await expect(viewer.locator('[aria-live]')).toHaveText(`1 / ${viewport.width > 700 ? 14 : 12}`);
			await page.keyboard.press('ArrowRight');
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
