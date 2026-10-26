import { test, expect } from '@playwright/test';

const HOME = '/photography';
for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 740 }]) {
	test.describe(`Photography home at ${viewport.width}px`, () => {
		test.use({ viewport });
		test('photo introduction, event discovery and return stay reachable', async ({ page }) => {
			await page.goto(HOME, { waitUntil: 'networkidle' });
			await expect(page.getByRole('heading', { name: 'Nino Chavez', exact: true })).toBeAttached();
			await expect(page.locator('.photo-home .photograph')).toHaveCount(12);
			const search = page.getByRole('searchbox', { name: 'Event, team, or date' });
			const bounds = await search.boundingBox();
			expect(bounds!.y + bounds!.height).toBeLessThan(viewport.height);
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
		test('portfolio viewer pages with keyboard and returns focus', async ({ page }) => {
			await page.goto(HOME, { waitUntil: 'networkidle' });
			const trigger = page.locator('.photo-home .photograph').first();
			await trigger.click();
			const viewer = page.getByRole('dialog');
			await expect(viewer).toBeVisible();
			await expect(viewer.locator('[aria-live]')).toHaveText('1 / 12');
			await page.keyboard.press('ArrowRight');
			await expect(viewer.locator('[aria-live]')).toHaveText('2 / 12');
			await page.keyboard.press('ArrowLeft');
			await expect(viewer.locator('[aria-live]')).toHaveText('1 / 12');
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
	await expect(page.locator('.photo-home img').first()).toBeVisible();
	await page.getByRole('searchbox', { name: 'Event, team, or date' }).fill('Chicago Point Series');
	await page.getByRole('button', { name: 'Search', exact: true }).click();
	await expect(page).toHaveURL(/\/photography\/albums\?q=Chicago\+Point\+Series/);
	await expect(page.getByRole('heading', { name: 'Events', exact: true })).toBeVisible();
	await context.close();
});
