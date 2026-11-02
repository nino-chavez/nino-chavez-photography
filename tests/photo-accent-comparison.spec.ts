import { expect, test } from '@playwright/test';

test('accent and viewport switching keep the same open photo', async ({ page }) => {
	test.setTimeout(90_000);
	await page.route(/(?:posthog|analytics\/collect|cdn-cgi\/rum|googletagmanager)/, route => route.abort());
	await page.goto('http://photo-accent.localhost:8840/');
	const gallery = page.frameLocator('#gallery');
	await expect(gallery.locator('.photo-card').first()).toBeVisible({ timeout: 30_000 });
	await expect(page.locator('#status')).toContainText('Interactive');
	await expect(gallery.locator('html')).toHaveAttribute('data-photography-accent', 'warm');
	await gallery.locator('.photo-card').first().click();
	const viewer = gallery.getByRole('dialog');
	await expect(viewer).toBeVisible();
	const initialImage = await viewer.locator('img').first().getAttribute('src');
	await page.getByRole('button', { name: 'Cool mint', exact: true }).click();
	await expect(gallery.locator('html')).toHaveAttribute('data-photography-accent', 'cool');
	await expect(viewer).toBeVisible();
	await expect(viewer.locator('img').first()).toHaveAttribute('src', initialImage!);
	await page.getByRole('button', { name: 'Mobile', exact: true }).click();
	await expect(page.locator('#gallery')).toHaveCSS('width', '390px');
	await expect(viewer).toBeVisible();
	await gallery.getByRole('button', { name: 'Close lightbox', exact: true }).click();
	await expect(viewer).toBeHidden();
	await expect(gallery.locator('.photo-card').first()).toBeFocused();
	await page.getByRole('button', { name: 'Warm coral', exact: true }).click();
	await expect(gallery.locator('html')).toHaveAttribute('data-photography-accent', 'warm');
});

test('preview accent cannot be activated on the ordinary local hostname', async ({ page }) => {
	const response = await page.goto('http://127.0.0.1:8841/photography/explore?study-accent=cool');
	expect(response?.headers()['x-frame-options']).toBe('DENY');
	await expect(page.locator('.photo-card').first()).toBeVisible({ timeout: 30_000 });
	await expect(page.locator('html')).not.toHaveAttribute('data-photography-accent');
	await expect(page.locator('.gallery-theme')).toHaveCSS('--gallery-accent', /#cbd8df/i);
});
