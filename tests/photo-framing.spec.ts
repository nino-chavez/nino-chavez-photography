import { expect, test, type Page } from '@playwright/test';

async function checkRows(page: Page, columns: number) {
	const grid = page.locator('.fitted-photo-grid').first();
	await expect(grid.locator('.photo-card').first()).toBeVisible();
	const boxes = await grid.locator('.fitted-photo-grid__item').evaluateAll((items) =>
		items.map((item) => {
			const box = item.getBoundingClientRect();
			return { top: box.top, left: box.left, width: box.width, height: box.height };
		})
	);
	expect(boxes.length).toBeGreaterThan(0);
	for (let start = 0; start + columns <= boxes.length; start += columns) {
		for (let i = 1; i < columns; i++) {
			expect(Math.abs(boxes[start + i].top - boxes[start].top)).toBeLessThan(1);
			expect(Math.abs(boxes[start + i].height - boxes[start].height)).toBeLessThan(1);
			expect(boxes[start + i].left).toBeGreaterThan(boxes[start + i - 1].left);
		}
	}
	const images = grid.locator('.photo-card img:not([aria-hidden])');
	await expect(images.first()).toBeVisible();
	await expect.poll(() => images.first().evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
	// SSR cards precede hydration. Placeholder removal proves the image/control effects mounted.
	await expect(grid.locator('.photo-card').first().locator('img[aria-hidden]')).toHaveCount(0);
	expect(await images.evaluateAll((els) => els.every((el) => getComputedStyle(el).objectFit === 'contain'))).toBe(true);
	expect(await images.first().getAttribute('srcset')).toContain('/medium 800w');
	expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

for (const width of [390, 640, 768, 900, 901, 1440]) {
	test(`mixed photo rows retain full frames and order at ${width}px`, async ({ page }) => {
		await page.setViewportSize({ width, height: 1050 });
		await page.goto('/photography/explore');
		await checkRows(page, width < 640 ? 2 : width < 901 ? 3 : 4);
		const links = await page.locator('.fitted-photo-grid .photo-card').evaluateAll((els) => els.map((el) => el.getAttribute('href')));
		await page.setViewportSize({ width: 1024, height: 1050 });
		expect(await page.locator('.fitted-photo-grid .photo-card').evaluateAll((els) => els.map((el) => el.getAttribute('href')))).toEqual(links);
	});
}

test('saved-photo control stays independent and the lightbox still opens and navigates', async ({ page }) => {
	await page.goto('/photography/explore');
	await checkRows(page, 4);
	const card = page.locator('.fitted-photo-grid .photo-card').first();
	await card.hover();
	await card.getByRole('button', { name: 'Save photo', exact: true }).click();
	await expect(card.getByRole('button', { name: 'Remove saved photo', exact: true })).toBeVisible();
	await expect(page.getByRole('dialog', { name: 'Photo lightbox' })).toHaveCount(0);
	await card.focus();
	await page.keyboard.press('Enter');
	const lightbox = page.getByRole('dialog', { name: 'Photo lightbox' });
	await expect(lightbox).toBeVisible();
	await expect(lightbox.getByText('1 / 24', { exact: true }).filter({ visible: true })).toBeVisible();
	await lightbox.getByRole('button', { name: 'Next photo', exact: true }).click();
	await expect(lightbox.getByText('2 / 24', { exact: true }).filter({ visible: true })).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(lightbox).toHaveCount(0);
	await page.goto('/photography/favorites');
	await checkRows(page, 4);
	await page.getByRole('button', { name: 'Remove saved photo', exact: true }).click();
	await expect(page.getByText('No saved photos yet', { exact: true })).toBeVisible();
});

test('private portrait album remains private and displays fitted rows', async ({ page }) => {
	test.skip(!process.env.PHOTO_GRID_PRIVATE_PATH, 'A private review album path must be provided by the operator.');
	await page.setViewportSize({ width: 1440, height: 1050 });
	await page.goto(process.env.PHOTO_GRID_PRIVATE_PATH!);
	await expect(page.locator('.fitted-photo-grid .photo-card')).toHaveCount(45);
	await checkRows(page, 4);
	await page.setViewportSize({ width: 390, height: 844 });
	await checkRows(page, 2);
	expect(process.env.PHOTO_GRID_PRIVATE_PUBLIC_PATH).toBeTruthy();
	const response = await page.request.get(process.env.PHOTO_GRID_PRIVATE_PUBLIC_PATH!);
	expect(response.status()).toBe(404);
});

test('image loading does not change the reserved photo rows', async ({ page }) => {
	let release!: () => void;
	const gate = new Promise<void>((resolve) => (release = resolve));
	await page.route('**/imagedelivery.net/**', async (route) => { await gate; await route.continue(); });
	await page.goto('/photography/explore', { waitUntil: 'domcontentloaded' });
	await expect(page.locator('.fitted-photo-grid .photo-card').first()).toBeVisible();
	await page.evaluate(() => document.fonts.ready);
	const boxes = () => page.locator('.fitted-photo-grid__item').evaluateAll((els) => els.map((el) => {
		const b = el.getBoundingClientRect();
		const grid = el.closest('.fitted-photo-grid')!.getBoundingClientRect();
		return [b.x - grid.x, b.y - grid.y, b.width, b.height];
	}));
	const before = await boxes();
	release();
	await expect.poll(() => page.locator('.photo-card img:not([aria-hidden])').first().evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
	expect(await boxes()).toEqual(before);
});

test('dense displays receive enough pixels for fitted photos', async ({ browser }) => {
	const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, deviceScaleFactor: 2 });
	const page = await context.newPage();
	await page.goto('/photography/explore');
	const image = page.locator('.fitted-photo-grid .photo-card img:not([aria-hidden])').first();
	await expect.poll(() => image.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
	const source = await image.evaluate((el) => ({ current: (el as HTMLImageElement).currentSrc, choices: (el as HTMLImageElement).srcset }));
	expect(source.choices).toContain('/large 1600w');
	expect(source.current).not.toMatch(/\/grid$/);
	await context.close();
});

test('a repeated camera filename still opens the clicked photo', async ({ page }) => {
	// Inject only a filename collision into two real result rows; retain their distinct IDs/media.
	await page.route('**/photography/explore', async (route) => {
		const response = await route.fetch();
		let index = 0;
		let firstKey = '';
		const body = (await response.text()).replace(/image_key:"([^"]+)"/g, (match, key) => {
			if (index++ === 0) firstKey = key;
			return index === 2 ? `image_key:"${firstKey}"` : match;
		});
		expect(index).toBeGreaterThan(2);
		await route.fulfill({ response, body });
	});
	await page.goto('/photography/explore');
	await checkRows(page, 4);
	const second = page.locator('.fitted-photo-grid .photo-card').nth(1);
	const imageId = await second.locator('img:not([aria-hidden])').getAttribute('src');
	const sourceId = new URL(imageId!).pathname.split('/')[2];
	await second.focus();
	await page.keyboard.press('Enter');
	await expect(page.getByRole('dialog', { name: 'Photo lightbox' }).locator('img').first()).toHaveAttribute('src', new RegExp(sourceId));
});

test('filter navigation keeps the previous row geometry until results arrive', async ({ page }) => {
	await page.goto('/photography/explore');
	await checkRows(page, 4);
	const boxes = () => page.locator('.fitted-photo-grid__item').evaluateAll((els) => els.map((el) => {
		const b = el.getBoundingClientRect(); return [b.x, b.y, b.width, b.height];
	}));
	const before = await boxes();
	let release!: () => void;
	let intercepted!: () => void;
	const gate = new Promise<void>((resolve) => (release = resolve));
	const pending = new Promise<void>((resolve) => (intercepted = resolve));
	await page.route('**/*__data.json*', async (route) => { intercepted(); await gate; await route.continue(); });
	const sort = page.locator('select').first();
	const next = await sort.locator('option').evaluateAll((els) => (els.find((el) => !(el as HTMLOptionElement).selected) as HTMLOptionElement).value);
	await sort.selectOption(next);
	await pending;
	try {
		await expect(page.locator('.explore-results')).toHaveAttribute('aria-busy', 'true');
		expect(await boxes()).toEqual(before);
	} finally { release(); }
	await expect(page.locator('.explore-results')).toHaveAttribute('aria-busy', 'false');
	await checkRows(page, 4);
});
