import { test, expect } from '@playwright/test';

const BASE_PATH = '/photography';
const CANONICAL_LANDING = 'https://ninochavez.co/photography';

test.describe('Canonical photography landing', () => {
	test.beforeEach(async ({ page }) => {
		await page.route(`${CANONICAL_LANDING}*`, async (route) => {
			await route.fulfill({
				contentType: 'text/html',
				body: '<!doctype html><title>Photography | Nino Chavez</title><h1>Photography</h1>'
			});
		});
	});

	test('gallery section link returns through the canonical landing', async ({ page }) => {
		await page.goto(`${BASE_PATH}/albums`);
		await page.getByRole('link', { name: 'Photography home' }).click();

		await expect(page).toHaveURL(CANONICAL_LANDING);
		await expect(page.getByRole('heading', { name: 'Photography' })).toBeVisible();
	});

	test('gallery root cannot render a second homepage', async ({ page }) => {
		await page.goto(BASE_PATH);

		await expect(page).toHaveURL(CANONICAL_LANDING);
		await expect(page.getByRole('heading', { name: 'Photography' })).toBeVisible();
	});
});
