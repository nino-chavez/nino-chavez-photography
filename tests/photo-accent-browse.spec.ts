import { expect, test } from '@playwright/test';

const explore = '/photography/explore';

test('photo search, active chips, clearing and sharing use the same URL state', async ({ page, context }) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	await page.goto(`${explore}?q=volleyball&division=girls&level=club&campaign=accent-comparison&search_id=11111111-1111-4111-8111-111111111111&page=2`);

	await expect(page.getByLabel('Search photos', { exact: true })).toHaveValue('volleyball');
	await expect(page.getByRole('button', { name: 'Remove filter: Search: volleyball' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Remove filter: Division: Girls' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Remove filter: Level: Club' })).toBeVisible();

	await page.getByRole('button', { name: 'Share filters (3 active)' }).click();
	const copied = new URL(await page.evaluate(() => navigator.clipboard.readText()));
	expect(copied.searchParams.get('q')).toBe('volleyball');
	expect(copied.searchParams.get('division')).toBe('girls');
	expect(copied.searchParams.get('level')).toBe('club');
	expect(copied.searchParams.get('campaign')).toBe('accent-comparison');
	expect(copied.searchParams.has('search_id')).toBe(false);
	expect(copied.searchParams.has('page')).toBe(false);

	await page.getByRole('button', { name: 'Remove filter: Search: volleyball' }).click();
	await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBeNull();
	await expect(page.getByLabel('Search photos', { exact: true })).toHaveValue('');
	expect(new URL(page.url()).searchParams.has('search_id')).toBe(false);

	await page.getByRole('button', { name: 'Clear all filters and search' }).click();
	await expect.poll(() => new URL(page.url()).search).toBe('?campaign=accent-comparison');
});

test('phone filter drawer keeps division and level choices reachable', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto(explore);
	await page.getByRole('button', { name: 'Open filters', exact: true }).click();
	const drawer = page.getByRole('dialog', { name: 'Filter options' });
	await drawer.getByRole('button', { name: /^Division/ }).click();
	await drawer.getByRole('button', { name: 'Girls', exact: true }).click();
	await expect.poll(() => new URL(page.url()).searchParams.get('division')).toBe('girls');
	await expect(drawer.getByRole('button', { name: 'Girls', exact: true })).toHaveAttribute('aria-pressed', 'true');
	await drawer.getByRole('button', { name: /^Level/ }).click();
	await expect(drawer.getByRole('button', { name: 'Club', exact: true })).toBeVisible();
	await drawer.getByRole('button', { name: 'View photos', exact: true }).click();
	await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

 test('empty search clears the query and its tracking context', async ({ page }) => {
 await page.goto('/photography/explore?q=volleyball&search_id=11111111-1111-4111-8111-111111111111');
 const search=page.getByLabel('Search photos',{exact:true});await search.fill('   ');await search.press('Enter');
 await expect.poll(()=>new URL(page.url()).searchParams.has('q')).toBe(false);
 expect(new URL(page.url()).searchParams.has('search_id')).toBe(false);
 });

 test('clear all drops active search tracking without first removing a chip', async ({ page }) => {
 await page.goto('/photography/explore?q=volleyball&division=girls&search_id=11111111-1111-4111-8111-111111111111');
 await page.getByRole('button',{name:'Clear all filters and search',exact:true}).click();
 await expect.poll(()=>new URL(page.url()).search).toBe('');
 });
