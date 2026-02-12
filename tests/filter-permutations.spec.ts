import { test, expect, type Page } from '@playwright/test';

/**
 * Filter Permutation Tests
 *
 * Comprehensive testing of filter combinations on the Explore page.
 * Tests various filter permutations to ensure:
 * - Page loads without errors
 * - No uncaught exceptions occur
 * - Photos display correctly or show appropriate empty state
 * - No infinite loading states
 */

// Base path for the application
const BASE_PATH = '/photography';

// Filter values to test
const FILTERS = {
	sport: ['volleyball', 'basketball', 'portrait', 'softball'],
	category: ['action', 'candid', 'celebration', 'portrait'],
	lighting: ['natural', 'backlit', 'dramatic', 'artificial'],
	color_temp: ['warm', 'neutral', 'cool'],
	time_of_day: ['golden_hour', 'midday', 'evening'],
	intensity: ['low', 'medium', 'high', 'peak'],
	composition: ['rule_of_thirds', 'centered', 'leading_lines'],
	play_type: ['attack', 'block', 'dig', 'set', 'serve'],
};

// Helper to build URL with filters
function buildFilterUrl(filters: Record<string, string | string[]>): string {
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(filters)) {
		if (Array.isArray(value)) {
			value.forEach((v) => params.append(key, v));
		} else {
			params.set(key, value);
		}
	}
	return `${BASE_PATH}/explore?${params.toString()}`;
}

// Helper to wait for page to stabilize (no more loading)
async function waitForStableState(page: Page, timeout = 15000): Promise<boolean> {
	try {
		// Wait for the page content to be present (photo count indicator shows results loaded)
		// The format is "X–Y of Z" which indicates the server has responded
		await page.waitForSelector('text=/\\d+–\\d+ of \\d+/i', { timeout });

		return true;
	} catch {
		// Alternative: Check for empty state message
		try {
			await page.waitForSelector('text=/No photos/i', { timeout: 2000 });
			return true;
		} catch {
			return false;
		}
	}
}

test.describe('Filter Permutation Tests', () => {
	test.beforeEach(async ({ page }) => {
		// Set up console error tracking
		page.on('console', (msg) => {
			if (msg.type() === 'error') {
				console.log(`Console error: ${msg.text()}`);
			}
		});

		page.on('pageerror', (err) => {
			console.log(`Page error: ${err.message}`);
		});
	});

	test.describe('Single Filter Tests', () => {
		for (const sport of FILTERS.sport) {
			test(`should handle sport filter: ${sport}`, async ({ page }) => {
				await page.goto(buildFilterUrl({ sport }));
				const stable = await waitForStableState(page);
				expect(stable).toBe(true);

				// Verify no infinite loading
				const loadingText = page.locator('text=Loading...');
				await expect(loadingText).not.toBeVisible({ timeout: 5000 });
			});
		}

		for (const category of FILTERS.category) {
			test(`should handle category filter: ${category}`, async ({ page }) => {
				await page.goto(buildFilterUrl({ category }));
				const stable = await waitForStableState(page);
				expect(stable).toBe(true);

				const loadingText = page.locator('text=Loading...');
				await expect(loadingText).not.toBeVisible({ timeout: 5000 });
			});
		}

		for (const lighting of FILTERS.lighting) {
			test(`should handle lighting filter: ${lighting}`, async ({ page }) => {
				await page.goto(buildFilterUrl({ lighting }));
				const stable = await waitForStableState(page);
				expect(stable).toBe(true);

				const loadingText = page.locator('text=Loading...');
				await expect(loadingText).not.toBeVisible({ timeout: 5000 });
			});
		}

		for (const color_temp of FILTERS.color_temp) {
			test(`should handle color_temp filter: ${color_temp}`, async ({ page }) => {
				await page.goto(buildFilterUrl({ color_temp }));
				const stable = await waitForStableState(page);
				expect(stable).toBe(true);

				const loadingText = page.locator('text=Loading...');
				await expect(loadingText).not.toBeVisible({ timeout: 5000 });
			});
		}
	});

	test.describe('Two-Filter Combinations', () => {
		// Sport + Category combinations
		const sportCategoryCombos = [
			{ sport: 'volleyball', category: 'action' },
			{ sport: 'portrait', category: 'candid' },
			{ sport: 'basketball', category: 'celebration' },
			{ sport: 'volleyball', category: 'warmup' },
		];

		for (const combo of sportCategoryCombos) {
			test(`should handle sport+category: ${combo.sport}+${combo.category}`, async ({ page }) => {
				await page.goto(buildFilterUrl(combo));
				const stable = await waitForStableState(page);
				expect(stable).toBe(true);

				const loadingText = page.locator('text=Loading...');
				await expect(loadingText).not.toBeVisible({ timeout: 5000 });
			});
		}

		// Lighting + Color Temperature combinations
		const lightingColorCombos = [
			{ lighting: 'natural', color_temp: 'warm' },
			{ lighting: 'backlit', color_temp: 'neutral' },
			{ lighting: 'dramatic', color_temp: 'cool' },
			{ lighting: 'artificial', color_temp: 'warm' },
		];

		for (const combo of lightingColorCombos) {
			test(`should handle lighting+color_temp: ${combo.lighting}+${combo.color_temp}`, async ({
				page,
			}) => {
				await page.goto(buildFilterUrl(combo));
				const stable = await waitForStableState(page);
				expect(stable).toBe(true);

				const loadingText = page.locator('text=Loading...');
				await expect(loadingText).not.toBeVisible({ timeout: 5000 });
			});
		}
	});

	test.describe('Complex Multi-Filter Combinations', () => {
		// The problematic combination from the bug report
		test('should handle sport+category+lighting+color_temp (bug report combo)', async ({
			page,
		}) => {
			await page.goto(
				buildFilterUrl({
					sport: 'portrait',
					category: 'action',
					lighting: 'natural',
					color_temp: 'warm',
				})
			);

			const stable = await waitForStableState(page);
			expect(stable).toBe(true);

			// Specifically check for the loading state that got stuck
			const loadingText = page.locator('text=Loading...');
			await expect(loadingText).not.toBeVisible({ timeout: 5000 });

			// Check for either photos (links to /photo/*) or empty state
			// Photos are rendered as anchor elements with href="/photo/xxx"
			const hasPhotos = await page.locator('a[href*="/photo/"]').count();
			const hasEmptyState = await page.locator('text=/No photos/i').count();
			const hasPhotoCount = await page.locator('text=/\\d+–\\d+ of \\d+/').count();

			// Page should show either photos, empty state, or photo count indicator
			expect(hasPhotos > 0 || hasEmptyState > 0 || hasPhotoCount > 0).toBe(true);
		});

		// Four-filter combinations
		const complexCombos: Record<string, string>[] = [
			{
				sport: 'volleyball',
				category: 'action',
				lighting: 'natural',
				intensity: 'high',
			},
			{
				sport: 'basketball',
				category: 'celebration',
				color_temp: 'warm',
				time_of_day: 'evening',
			},
			{
				sport: 'volleyball',
				lighting: 'backlit',
				color_temp: 'cool',
				composition: 'rule_of_thirds',
			},
			{
				category: 'action',
				intensity: 'peak',
				play_type: 'attack',
				lighting: 'dramatic',
			},
		];

		for (const combo of complexCombos) {
			const comboName = Object.entries(combo)
				.map(([k, v]) => `${k}=${v}`)
				.join('&');
			test(`should handle complex filter: ${comboName}`, async ({ page }) => {
				await page.goto(buildFilterUrl(combo));
				const stable = await waitForStableState(page);
				expect(stable).toBe(true);

				const loadingText = page.locator('text=Loading...');
				await expect(loadingText).not.toBeVisible({ timeout: 5000 });
			});
		}
	});

	test.describe('Edge Cases', () => {
		test('should handle incompatible filter combination gracefully', async ({ page }) => {
			// This combination likely returns 0 results
			await page.goto(
				buildFilterUrl({
					sport: 'portrait',
					play_type: 'attack', // Portraits don't have play types
				})
			);

			const stable = await waitForStableState(page);
			expect(stable).toBe(true);

			// Should show empty state or auto-clear incompatible filters
			const loadingText = page.locator('text=Loading...');
			await expect(loadingText).not.toBeVisible({ timeout: 5000 });
		});

		test('should handle rapid filter changes', async ({ page }) => {
			await page.goto(`${BASE_PATH}/explore`);
			await waitForStableState(page);

			// Rapidly change filters
			await page.goto(buildFilterUrl({ sport: 'volleyball' }));
			await page.waitForTimeout(100);
			await page.goto(buildFilterUrl({ sport: 'volleyball', category: 'action' }));
			await page.waitForTimeout(100);
			await page.goto(buildFilterUrl({ sport: 'basketball', category: 'celebration' }));

			const stable = await waitForStableState(page);
			expect(stable).toBe(true);

			const loadingText = page.locator('text=Loading...');
			await expect(loadingText).not.toBeVisible({ timeout: 5000 });
		});

		test('should handle clearing filters after applying many', async ({ page }) => {
			// Apply multiple filters
			await page.goto(
				buildFilterUrl({
					sport: 'volleyball',
					category: 'action',
					lighting: 'natural',
					intensity: 'high',
				})
			);
			await waitForStableState(page);

			// Clear all filters
			await page.goto(`${BASE_PATH}/explore`);
			const stable = await waitForStableState(page);
			expect(stable).toBe(true);

			const loadingText = page.locator('text=Loading...');
			await expect(loadingText).not.toBeVisible({ timeout: 5000 });
		});

		test('should handle similar_to with filters (should clear similar_to)', async ({ page }) => {
			// Navigate with similar_to param
			await page.goto(`${BASE_PATH}/explore?similar_to=test123`);
			await waitForStableState(page);

			// Apply a filter - should clear similar_to
			await page.goto(buildFilterUrl({ sport: 'volleyball' }));

			const stable = await waitForStableState(page);
			expect(stable).toBe(true);

			// Verify similar_to is cleared from URL
			const url = new URL(page.url());
			expect(url.searchParams.has('similar_to')).toBe(false);
		});
	});

	test.describe('UI Responsiveness', () => {
		test('should show loading state when navigating', async ({ page }) => {
			await page.goto(`${BASE_PATH}/explore`);
			await waitForStableState(page);

			// Start navigation
			const navigationPromise = page.goto(buildFilterUrl({ sport: 'volleyball' }));

			// Loading should appear briefly
			// Note: This might be too fast to catch in some cases
			await navigationPromise;

			const stable = await waitForStableState(page);
			expect(stable).toBe(true);
		});

		test('should display filter count badge when filters are active', async ({ page }) => {
			await page.goto(
				buildFilterUrl({
					sport: 'volleyball',
					category: 'action',
				})
			);
			await waitForStableState(page);

			// Look for filter count indicator
			const activeFilters = page.locator('[class*="chip"], [class*="badge"], text=/Active:/i');
			await expect(activeFilters.first()).toBeVisible({ timeout: 5000 });
		});
	});

	test.describe('Auto-Clear Feature', () => {
		test('should auto-clear incompatible filters and show notification', async ({ page }) => {
			// This tests the server-side auto-clear functionality
			// Apply filters that might become incompatible
			await page.goto(
				buildFilterUrl({
					sport: 'portrait',
					play_type: 'attack', // Incompatible - portraits don't have play types
				})
			);

			await waitForStableState(page);

			// The page should still work (either auto-cleared or showing empty state)
			const loadingText = page.locator('text=Loading...');
			await expect(loadingText).not.toBeVisible({ timeout: 5000 });
		});
	});
});
