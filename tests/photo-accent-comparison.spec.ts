import { expect, test } from '@playwright/test';

// The comparison has two explicit local servers and is not part of the ordinary
// application test environment. Opt in only after starting the review preview.
test.skip(process.env.PHOTOGRAPHY_ACCENT_REVIEW !== '1', 'Requires the local Photography comparison servers');

test('accent and viewport switching keep the same open photo', async ({ page }) => {
	test.setTimeout(90_000);
	await page.route(/(?:posthog|analytics\/collect|cdn-cgi\/rum|googletagmanager)/, route => route.abort());
	await page.goto('http://photo-accent.localhost:8840/');
	const gallery = page.frameLocator('#gallery');
	await expect(gallery.locator('.photo-card').first()).toBeVisible({ timeout: 30_000 });
	await expect(page.locator('#status')).toContainText('Interactive');
	await expect(gallery.locator('html')).toHaveAttribute('data-photography-accent', 'cool');
	await page.getByRole('button', { name: 'Warm coral', exact: true }).click();
	await expect(gallery.locator('html')).toHaveAttribute('data-photography-accent', 'warm');
	await gallery.locator('.photo-card').first().click();
	const viewer = gallery.getByRole('dialog');
	await expect(viewer).toBeVisible();
	const initialImage = await viewer.locator('img').first().getAttribute('src');
	await page.getByRole('button', { name: 'Cool mint', exact: true }).click();
	await expect(gallery.locator('html')).toHaveAttribute('data-photography-accent', 'cool');
	await expect(viewer).toBeVisible();
	await expect(viewer.locator('img').first()).toHaveAttribute('src', initialImage!);
	await page.getByRole('button', { name: 'Original gold', exact: true }).click();
	await expect(gallery.locator('html')).toHaveAttribute('data-photography-accent', 'gold');
	await expect(viewer.locator('.viewer-save')).toHaveCSS('background-color', 'rgb(212, 175, 55)');
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


test('gold composition comparison preserves the selected photo and keeps secondary controls quiet', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto('http://photo-accent.localhost:8840/composition.html');
  const app = page.frameLocator('#gallery');
  await expect(app.locator('html')).toHaveAttribute('data-photography-composition', 'refined');
  await expect(app.locator('.event-search button')).toHaveCSS('background-color', 'rgb(212, 175, 55)');
  await page.getByRole('button', { name: 'Before', exact: true }).click();
  await expect(app.locator('.event-search button')).toHaveCSS('background-color', 'rgb(240, 239, 235)');
  await page.getByRole('button', { name: 'Refined', exact: true }).click();
  await expect(app.locator('.gallery-cta').first()).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await page.getByLabel('Page', { exact: true }).selectOption('bright');
  await expect(app.locator('.photo-card').first()).toBeVisible();
  await app.locator('.photo-card').first().click();
  const viewer = app.getByRole('dialog', { name: 'Photo lightbox' });
  const image = await viewer.locator('img').first().getAttribute('data-analytics-photo-id');
  await viewer.getByRole('button', { name: 'Save photograph', exact: true }).click();
  await expect(viewer.getByRole('button', { name: 'Saved · Remove', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Before', exact: true }).click();
  await expect(app.locator('html')).toHaveAttribute('data-photography-composition', 'before');
  await expect(viewer.locator('img').first()).toHaveAttribute('data-analytics-photo-id', image!);
  await page.getByRole('button', { name: 'Refined', exact: true }).click();
  await page.getByRole('button', { name: 'Mobile', exact: true }).click();
  await expect(viewer.locator('img').first()).toHaveAttribute('data-analytics-photo-id', image!);
  await viewer.getByRole('button', { name: 'Close lightbox', exact: true }).click();
  await expect(app.locator('.photo-card').first()).toBeFocused();
  await page.setViewportSize({ width: 320, height: 1100 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
