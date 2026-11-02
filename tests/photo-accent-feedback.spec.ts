import { expect, test } from '@playwright/test';

const albumPath = '/photography/albums/college-womens-vb-millikin-at-north-central-09-23-2026-DWdCET';

test('save feedback stays consistent, recoverable, and stacked', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto(albumPath);

	const firstCard = page.locator('.album-photo-grid .photo-card').first();
	await expect(firstCard).toBeVisible();
	await firstCard.click();

	const viewer = page.getByRole('dialog', { name: 'Photo lightbox' });
	await expect(viewer).toBeVisible();
	const viewerSave = viewer.getByRole('button', { name: 'Save photograph', exact: true });
	await viewerSave.click();
	await expect(viewer.getByRole('button', { name: 'Saved · Remove', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await viewer.getByRole('button', { name: 'Close lightbox', exact: true }).click();

	await firstCard.hover();
	await expect(firstCard.getByRole('button', { name: 'Remove saved photo', exact: true })).toBeVisible();

	await page.goto('/photography/favorites');
	await expect(page.locator('.photo-card')).toHaveCount(1);
	await page.reload();
	await expect(page.locator('.photo-card')).toHaveCount(1);

	const savedCard = page.locator('.photo-card').first();
	await savedCard.hover();
	await savedCard.getByRole('button', { name: 'Remove saved photo', exact: true }).click();
	const undo = page.getByRole('button', { name: 'Undo', exact: true });
	await expect(undo).toBeVisible();
	await undo.focus();
	await page.keyboard.press('Enter');
	await expect(page.locator('.photo-card')).toHaveCount(1);
	await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('gallery-favorites') ?? '{}').photoIds?.length)).toBe(1);
	const dismiss = page.getByRole('button', { name: 'Dismiss notification', exact: true });
	while (await dismiss.count()) await dismiss.first().click();

	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto(albumPath);
	const cards = page.locator('.album-photo-grid .photo-card');
	await cards.nth(1).getByRole('button', { name: 'Save photo', exact: true }).click();
	await cards.nth(2).getByRole('button', { name: 'Save photo', exact: true }).click();

	await expect(page.locator('[data-toast-container] [data-toast-stack-item]')).toHaveCount(2);
	const toastLayout = await page.locator('[data-toast-container]').evaluate((container) => {
		const notices = Array.from(container.querySelectorAll<HTMLElement>('[data-toast-stack-item]'));
		const boxes = notices.map((notice) => notice.getBoundingClientRect());
		return {
			position: getComputedStyle(container).position,
			noticesAreNormalFlow: notices.every((notice) => getComputedStyle(notice).position === 'static'),
			noneOverlap: boxes.every((box, index) =>
				boxes.slice(index + 1).every((other) => box.bottom <= other.top || other.bottom <= box.top)
			)
		};
	});

	expect(toastLayout).toEqual({ position: 'fixed', noticesAreNormalFlow: true, noneOverlap: true });
});
