import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';

// Real published content, through the local read-only preview. Each test gets
// an isolated browser context, so Saved never reads or changes personal state.
const albumPath = '/photography/albums/college-womens-vb-millikin-at-north-central-09-23-2026-DWdCET';

test.beforeEach(async ({ page, baseURL }) => {
	expect(['localhost', '127.0.0.1']).toContain(new URL(baseURL!).hostname);
	await page.route('**/*', async (route) => {
		if (['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())) {
			await route.continue();
		} else {
			await route.fulfill({ status: 403, contentType: 'application/json', body: '{"error":"Read-only UX test"}' });
		}
	});
	await page.goto(albumPath);
	await expect(page.locator('.album-photo-grid .photo-card').first()).toBeVisible();
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
	test(`viewer preserves keyboard position at ${viewport.width}px`, async ({ page }) => {
		await page.setViewportSize(viewport);
		const trigger = page.locator('.album-photo-grid .photo-card').first();
		await trigger.focus();
		await page.keyboard.press('Enter');
		const viewer = page.getByRole('dialog', { name: 'Photo lightbox' });
		await expect(viewer).toBeVisible();
		await expect(viewer.getByRole('button', { name: 'Close lightbox' })).toBeFocused();

		// Cycling both ways must never reach controls underneath the viewer.
		for (const key of ['Tab', 'Shift+Tab']) {
			for (let i = 0; i < 12; i++) {
				await page.keyboard.press(key);
				await expect.poll(() => viewer.evaluate((node) => node.contains(document.activeElement))).toBe(true);
			}
		}
		const image = viewer.locator('img').first();
		const firstSource = await image.getAttribute('src');
		await page.keyboard.press('ArrowRight');
		await expect.poll(() => image.getAttribute('src')).not.toBe(firstSource);
		await page.keyboard.press('ArrowLeft');
		await expect(image).toHaveAttribute('src', firstSource!);
		await page.keyboard.press('Escape');
		await expect(viewer).toBeHidden();
		await expect(trigger).toBeFocused();

		await page.keyboard.press('Enter');
		await viewer.getByRole('button', { name: 'Close lightbox' }).click();
		await expect(viewer).toBeHidden();
		await expect(trigger).toBeFocused();
	});
}

test('a saved photo survives reload and can be removed', async ({ page }) => {
	const card = page.locator('.album-photo-grid .photo-card').first();
	const href = await card.getAttribute('href');
	await card.hover();
	await card.getByRole('button', { name: 'Save photo', exact: true }).click();
	await expect(card.getByRole('button', { name: 'Remove saved photo', exact: true })).toBeVisible();
	await page.goto('/photography/favorites');
	await expect(page.locator(`.photo-card[href="${href}"]`)).toBeVisible();
	await page.reload();
	const saved = page.locator(`.photo-card[href="${href}"]`);
	await expect(saved).toBeVisible();
	await saved.hover();
	await saved.getByRole('button', { name: 'Remove saved photo', exact: true }).click();
	await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('gallery-favorites')!).photoIds.length)).toBe(0);
	await expect(page.getByText('No saved photos yet', { exact: true })).toBeVisible();
	await page.reload();
	await expect(page.getByText('No saved photos yet', { exact: true })).toBeVisible();
});

test('photo download delivers a decodable image', async ({ page }, testInfo) => {
	await page.locator('.album-photo-grid .photo-card').first().click();
	const viewer = page.getByRole('dialog', { name: 'Photo lightbox' });
	await viewer.getByRole('button', { name: 'Download photo' }).click();
	const downloadPromise = page.waitForEvent('download');
	await viewer.getByRole('button', { name: /Thumbnail/ }).click();
	const download = await downloadPromise;
	expect(await download.failure()).toBeNull();
	expect(download.suggestedFilename()).toMatch(/_thumb\.jpg$/);
	const path = testInfo.outputPath('delivered-photo.jpg');
	await download.saveAs(path);
	const bytes = await readFile(path);
	expect(bytes.length).toBeGreaterThan(1000);
	const metadata = await sharp(bytes).metadata();
	expect(metadata.format).toBe('jpeg');
	expect(metadata.width).toBeGreaterThan(0);
	expect(metadata.height).toBeGreaterThan(0);
});
