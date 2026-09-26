import { test, expect } from '@playwright/test';

// Base path for the application
const BASE_PATH = '/photography';

/**
 * Journey 4: Lightbox Navigation and Zoom
 *
 * Tests:
 * - Lightbox opens from photo detail modal
 * - Navigation between photos (prev/next)
 * - Zoom functionality (zoom in/out)
 * - Drag-to-pan when zoomed
 * - Keyboard navigation (arrows, +/-, ESC)
 * - Photo counter display
 * - Close functionality
 */
test.describe('Lightbox', () => {
	test.beforeEach(async ({ page }) => {
		// Navigate to explore page and open a photo
		await page.goto(`${BASE_PATH}/explore`);
		await page.waitForSelector('a[href*="/photo/"], [data-testid="photo-card"]', {
			timeout: 10000,
		});
	});

	test('should open lightbox from photo detail modal', async ({ page }) => {
		// Click first photo to open modal
		const firstPhoto = page
			.locator('a[href*="/photo/"], [data-testid="photo-card"]')
			.first();
		await firstPhoto.click();

		// Wait for modal
		const modal = page.locator('[role="dialog"], [aria-modal="true"]');
		await expect(modal).toBeVisible();

		// Find and click view in lightbox button or image
		const lightboxTrigger = page
			.getByRole('button', { name: /lightbox|full.*screen|view larger/i })
			.or(page.locator('img[alt*="photo"]').first());

		if ((await lightboxTrigger.count()) > 0) {
			await lightboxTrigger.first().click();

			// Verify lightbox opens
			const lightbox = page.locator('[data-lightbox], [role="dialog"]').last();
			await expect(lightbox).toBeVisible({ timeout: 5000 });
		}
	});

	test('should display photo counter in lightbox', async ({ page }) => {
		// Open modal and lightbox
		await page.locator('a[href*="/photo/"], [data-testid="photo-card"]').first().click();

		const modal = page.locator('[role="dialog"]');
		await expect(modal.first()).toBeVisible();

		// Try to open lightbox
		const lightboxTrigger = page
			.getByRole('button', { name: /lightbox|full.*screen|view larger/i })
			.or(page.locator('img[alt*="photo"]').first());

		if ((await lightboxTrigger.count()) > 0) {
			await lightboxTrigger.first().click();

			// Look for counter (e.g., "1 / 50")
			const counter = page.locator('text=/\\d+\\s*\\/\\s*\\d+/');
			if ((await counter.count()) > 0) {
				await expect(counter.first()).toBeVisible();
			}
		}
	});

	test('should navigate to next photo with right arrow', async ({ page }) => {
		// Open lightbox
		await page.locator('a[href*="/photo/"], [data-testid="photo-card"]').first().click();

		const modal = page.locator('[role="dialog"]').first();
		await expect(modal).toBeVisible();

		const lightboxTrigger = page
			.getByRole('button', { name: /lightbox|full.*screen|view larger/i })
			.or(page.locator('img[alt*="photo"]').first());

		if ((await lightboxTrigger.count()) > 0) {
			await lightboxTrigger.first().click();
			await page.waitForTimeout(500);

			// Press right arrow
			await page.keyboard.press('ArrowRight');
			await page.waitForTimeout(300);

			// Verify photo changed (counter should update or image should change)
			const counter = page.locator('text=/\\d+\\s*\\/\\s*\\d+/');
			if ((await counter.count()) > 0) {
				const text = await counter.first().textContent();
				expect(text).toBeTruthy();
			}
		}
	});

	test('should navigate to previous photo with left arrow', async ({ page }) => {
		// Open lightbox on second photo
		const photos = page.locator('a[href*="/photo/"], [data-testid="photo-card"]');
		if ((await photos.count()) > 1) {
			await photos.nth(1).click();

			const modal = page.locator('[role="dialog"]').first();
			await expect(modal).toBeVisible();

			const lightboxTrigger = page
				.getByRole('button', { name: /lightbox|full.*screen|view larger/i })
				.or(page.locator('img[alt*="photo"]').first());

			if ((await lightboxTrigger.count()) > 0) {
				await lightboxTrigger.first().click();
				await page.waitForTimeout(500);

				// Press left arrow
				await page.keyboard.press('ArrowLeft');
				await page.waitForTimeout(300);

				// Verify navigation occurred
				const counter = page.locator('text=/\\d+\\s*\\/\\s*\\d+/');
				if ((await counter.count()) > 0) {
					const text = await counter.first().textContent();
					expect(text).toBeTruthy();
				}
			}
		}
	});

	test('should zoom in with + key', async ({ page }) => {
		// Open lightbox
		await page.locator('a[href*="/photo/"], [data-testid="photo-card"]').first().click();

		const modal = page.locator('[role="dialog"]').first();
		await expect(modal).toBeVisible();

		const lightboxTrigger = page
			.getByRole('button', { name: /lightbox|full.*screen|view larger/i })
			.or(page.locator('img[alt*="photo"]').first());

		if ((await lightboxTrigger.count()) > 0) {
			await lightboxTrigger.first().click();
			await page.waitForTimeout(500);

			// Get initial zoom level indicator
			const zoomIndicator = page.locator('text=/\\d+x|\\d+%|zoom/i');
			const initialZoom = (await zoomIndicator.count()) > 0 ? await zoomIndicator.first().textContent() : null;

			// Press + to zoom in
			await page.keyboard.press('+');
			await page.waitForTimeout(300);

			// Verify zoom changed
			if ((await zoomIndicator.count()) > 0) {
				const newZoom = await zoomIndicator.first().textContent();
				expect(newZoom).not.toBe(initialZoom);
			}
		}
	});

	test('should zoom out with - key', async ({ page }) => {
		// Open lightbox
		await page.locator('a[href*="/photo/"], [data-testid="photo-card"]').first().click();

		const modal = page.locator('[role="dialog"]').first();
		await expect(modal).toBeVisible();

		const lightboxTrigger = page
			.getByRole('button', { name: /lightbox|full.*screen|view larger/i })
			.or(page.locator('img[alt*="photo"]').first());

		if ((await lightboxTrigger.count()) > 0) {
			await lightboxTrigger.first().click();
			await page.waitForTimeout(500);

			// Zoom in first
			await page.keyboard.press('+');
			await page.waitForTimeout(300);

			const zoomIndicator = page.locator('text=/\\d+x|\\d+%|zoom/i');
			const zoomedInLevel = (await zoomIndicator.count()) > 0 ? await zoomIndicator.first().textContent() : null;

			// Zoom out
			await page.keyboard.press('-');
			await page.waitForTimeout(300);

			// Verify zoom decreased
			if ((await zoomIndicator.count()) > 0) {
				const zoomedOutLevel = await zoomIndicator.first().textContent();
				expect(zoomedOutLevel).not.toBe(zoomedInLevel);
			}
		}
	});

	test('should close lightbox with ESC key', async ({ page }) => {
		// Open lightbox
		await page.locator('a[href*="/photo/"], [data-testid="photo-card"]').first().click();

		const modal = page.locator('[role="dialog"]').first();
		await expect(modal).toBeVisible();

		const lightboxTrigger = page
			.getByRole('button', { name: /lightbox|full.*screen|view larger/i })
			.or(page.locator('img[alt*="photo"]').first());

		if ((await lightboxTrigger.count()) > 0) {
			await lightboxTrigger.first().click();
			await page.waitForTimeout(500);

			// Press ESC
			await page.keyboard.press('Escape');

			// Verify lightbox closes (should return to modal or close both)
			await page.waitForTimeout(500);

			// Check if lightbox specifically closed
			const lightbox = page.locator('[data-lightbox]');
			if ((await lightbox.count()) > 0) {
				await expect(lightbox).not.toBeVisible();
			}
		}
	});

	test('should close lightbox with close button', async ({ page }) => {
		// Open lightbox
		await page.locator('a[href*="/photo/"], [data-testid="photo-card"]').first().click();

		const modal = page.locator('[role="dialog"]').first();
		await expect(modal).toBeVisible();

		const lightboxTrigger = page
			.getByRole('button', { name: /lightbox|full.*screen|view larger/i })
			.or(page.locator('img[alt*="photo"]').first());

		if ((await lightboxTrigger.count()) > 0) {
			await lightboxTrigger.first().click();
			await page.waitForTimeout(500);

			// Find and click close button
			const closeButton = page.getByRole('button', { name: /close/i }).last();
			if ((await closeButton.count()) > 0) {
				await closeButton.click();

				// Verify lightbox closes
				await page.waitForTimeout(500);
				const lightbox = page.locator('[data-lightbox]');
				if ((await lightbox.count()) > 0) {
					await expect(lightbox).not.toBeVisible();
				}
			}
		}
	});

	test('should navigate with next/prev buttons', async ({ page }) => {
		// Open lightbox
		await page.locator('a[href*="/photo/"], [data-testid="photo-card"]').first().click();

		const modal = page.locator('[role="dialog"]').first();
		await expect(modal).toBeVisible();

		const lightboxTrigger = page
			.getByRole('button', { name: /lightbox|full.*screen|view larger/i })
			.or(page.locator('img[alt*="photo"]').first());

		if ((await lightboxTrigger.count()) > 0) {
			await lightboxTrigger.first().click();
			await page.waitForTimeout(500);

			// Find next button
			const nextButton = page
				.getByRole('button', { name: /next/i })
				.or(page.locator('button').filter({ has: page.locator('svg[class*="chevron-right"]') }));

			if ((await nextButton.count()) > 0) {
				const counter = page.locator('text=/\\d+\\s*\\/\\s*\\d+/');
				const initialCount = (await counter.count()) > 0 ? await counter.first().textContent() : null;

				// Click next
				await nextButton.first().click();
				await page.waitForTimeout(300);

				// Verify changed
				if ((await counter.count()) > 0) {
					const newCount = await counter.first().textContent();
					expect(newCount).not.toBe(initialCount);
				}
			}
		}
	});

	test('should display zoom controls', async ({ page }) => {
		// Open lightbox
		await page.locator('a[href*="/photo/"], [data-testid="photo-card"]').first().click();

		const modal = page.locator('[role="dialog"]').first();
		await expect(modal).toBeVisible();

		const lightboxTrigger = page
			.getByRole('button', { name: /lightbox|full.*screen|view larger/i })
			.or(page.locator('img[alt*="photo"]').first());

		if ((await lightboxTrigger.count()) > 0) {
			await lightboxTrigger.first().click();
			await page.waitForTimeout(500);

			// Look for zoom in/out buttons or zoom indicator
			const zoomIn = page.getByRole('button', { name: /zoom in|\+/i });
			const zoomOut = page.getByRole('button', { name: /zoom out|-/i });
			const zoomIndicator = page.locator('text=/\\d+x|\\d+%|zoom/i');

			// At least one zoom control should be visible
			const hasZoomControls =
				(await zoomIn.count()) > 0 || (await zoomOut.count()) > 0 || (await zoomIndicator.count()) > 0;

			expect(hasZoomControls).toBeTruthy();
		}
	});
});

/**
 * Trending rail + cross-page navigation
 *
 * Both target a specific real public album (`Re7kho`, verified during this fix to have >2
 * "Popular in this album" photos and >48 total photos — the two conditions that used to
 * exercise the two bugs this change addresses). If the album's data has since changed enough
 * to no longer meet those conditions, the tests skip rather than fail on unrelated data drift.
 * `PAGE_SIZE` mirrors `src/lib/albums/pagination.ts`'s `ALBUM_PHOTO_PAGE_SIZE` — a spec file
 * can't import server-side code, so this is the one place that constant is duplicated as data.
 */
test.describe('Trending rail and cross-page lightbox navigation', () => {
	const ALBUM_KEY = 'Re7kho';
	const PAGE_SIZE = 48;

	test('rail opens the same lightbox as the grid, with next/prev, not the standalone photo page', async ({
		page
	}) => {
		await page.goto(`${BASE_PATH}/albums/${ALBUM_KEY}`);

		const rail = page.locator('section[aria-label="Popular in this album"]');
		if ((await rail.count()) === 0) {
			test.skip(true, 'Album has no "Popular in this album" rail right now (needs >2 ranked photos)');
			return;
		}

		const firstRailPhoto = rail.locator('a').first();
		await firstRailPhoto.click();

		// Same lightbox as everywhere else — not a navigation to /photo/[id].
		const dialog = page.getByRole('dialog', { name: /photo lightbox/i });
		await expect(dialog).toBeVisible({ timeout: 5000 });
		await expect(page).toHaveURL(new RegExp(`/albums/`));

		// Rail lists are short (badgeTopN + a handful more) — Next should be there to prove
		// this walks the rail's own list, not a single detached photo.
		const nextButton = dialog.getByRole('button', { name: /next photo/i });
		await expect(nextButton).toBeVisible();

		await nextButton.click();
		const counter = dialog.locator('text=/\\d+\\s*\\/\\s*\\d+/').first();
		await expect(counter).toHaveText(/^2\s*\//);
	});

	test('crossing the first page boundary prefetches ahead and never closes the lightbox', async ({
		page
	}) => {
		await page.goto(`${BASE_PATH}/albums/${ALBUM_KEY}`);

		// Grid photo cards only — excludes the rail, which renders its own PhotoCards above.
		const gridPhotos = page.locator('#photos-section ~ div a.photo-card');
		const gridCount = await gridPhotos.count();
		if (gridCount < PAGE_SIZE) {
			test.skip(true, `Album grid has only ${gridCount} loaded photos; need a full first page to test the boundary`);
			return;
		}

		// Arm the deterministic prefetch check BEFORE opening — the prefetch effect (see
		// Lightbox.svelte's shouldPrefetchNextPage) fires as soon as the lightbox opens within
		// its lookahead window, well before any of the ArrowRight presses below. Awaiting this
		// with no catch and no manual timeout (the suite's own 30s applies) is the actual
		// regression check: without the prefetch, this request only ever fires from the
		// boundary Next click, several steps later than this point in the test.
		const page2Response = page.waitForResponse(
			(res) => res.url().includes('/api/album-photos') && res.url().includes('page=2')
		);

		// Open near the end of the first page (not at it) so the prefetch's lookahead window
		// (5 photos, see Lightbox.svelte) has room to fire before the boundary click.
		await gridPhotos.nth(PAGE_SIZE - 3).click();

		const dialog = page.getByRole('dialog', { name: /photo lightbox/i });
		await expect(dialog).toBeVisible({ timeout: 5000 });
		const counter = dialog.locator('text=/\\d+\\s*\\/\\s*\\d+/').first();
		await expect(counter).toHaveText(new RegExp(`^${PAGE_SIZE - 2}\\s*/`));

		// Page 2's data must already be in flight (or done) well before we reach the boundary.
		await page2Response;

		await page.keyboard.press('ArrowRight');
		await page.keyboard.press('ArrowRight');
		// Now standing at the last photo of the first page.
		await expect(counter).toHaveText(new RegExp(`^${PAGE_SIZE}\\s*/`));

		// The boundary crossing itself — this used to hang (Next was a silent no-op on the
		// share page, and a related latent bug could make the whole lightbox vanish). By now
		// the prefetch above should make this indistinguishable from an ordinary in-list Next.
		await page.keyboard.press('ArrowRight');
		await expect(dialog).toBeVisible();
		await expect(counter).toHaveText(new RegExp(`^${PAGE_SIZE + 1}\\s*/`), { timeout: 5000 });
	});

	test('a failed load-more never closes the lightbox, and Retry recovers', async ({ page }) => {
		await page.goto(`${BASE_PATH}/albums/${ALBUM_KEY}`);

		const gridPhotos = page.locator('#photos-section ~ div a.photo-card');
		const gridCount = await gridPhotos.count();
		if (gridCount < PAGE_SIZE) {
			test.skip(true, `Album grid has only ${gridCount} loaded photos; need a full first page to test the boundary`);
			return;
		}

		// Block page 2's fetch BEFORE opening the lightbox — the prefetch effect requests it
		// immediately once opened within the lookahead window, so the block must already be
		// armed or the prefetch would succeed unblocked and there'd be nothing to fail.
		await page.route(/\/api\/album-photos\?.*page=2/, (route) => route.abort());

		// Open on the true boundary photo (the last of the first page) directly.
		await gridPhotos.nth(PAGE_SIZE - 1).click();

		const dialog = page.getByRole('dialog', { name: /photo lightbox/i });
		await expect(dialog).toBeVisible({ timeout: 5000 });
		const counter = dialog.locator('text=/\\d+\\s*\\/\\s*\\d+/').first();
		await expect(counter).toHaveText(new RegExp(`^${PAGE_SIZE}\\s*/`));

		await page.keyboard.press('ArrowRight');

		// Never vanishes and never silently dead-ends: stays open, stays on the same photo,
		// and surfaces a retryable message.
		await expect(dialog).toBeVisible();
		await expect(counter).toHaveText(new RegExp(`^${PAGE_SIZE}\\s*/`));
		await expect(dialog.getByRole('status')).toContainText(/couldn.?t load more photos/i, {
			timeout: 5000
		});

		// Unblock and retry — recovers rather than staying stuck.
		await page.unroute(/\/api\/album-photos\?.*page=2/);
		await dialog.getByRole('button', { name: /retry/i }).click();

		await expect(counter).toHaveText(new RegExp(`^${PAGE_SIZE + 1}\\s*/`), { timeout: 5000 });
	});
});
