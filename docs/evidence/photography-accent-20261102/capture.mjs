import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(new URL('../../../package.json', import.meta.url));
const { chromium, expect } = require('@playwright/test');
const out = dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch({ headless: true });
const records = [];
async function capture(page, name) {
  await page.waitForFunction(() => [...document.querySelectorAll('.photo-card img')].filter(img => {
    const r = img.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0;
  }).every(img => img.complete && img.naturalWidth > 0), null, { timeout: 10000 }).catch(() => {});
  await page.screenshot({ path: join(out, name + '.png'), animations: 'disabled' });
  const record = await page.evaluate(() => ({ url: location.href, width: innerWidth, overflow: document.documentElement.scrollWidth > innerWidth, accent: getComputedStyle(document.querySelector('.gallery-theme')).getPropertyValue('--gallery-accent'), dialogs: [...document.querySelectorAll('[role="dialog"],dialog[open]')].map(el => el.getAttribute('aria-label')), notices: [...document.querySelectorAll('[data-toast-item]')].map(el => el.textContent.trim()) }));
  records.push({ name, ...record });
  console.log(name);
}
try {
  for (const width of [1440, 390]) for (const accent of ['warm', 'cool', 'gold']) {
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 } });
    const page = await context.newPage();
    await page.route(/(?:posthog|analytics\/collect|cdn-cgi\/rum|googletagmanager)/, route => route.abort());
    await page.goto(`http://photo-accent.localhost:8841/photography/explore?study-accent=${accent}`);
    await expect(page.locator('html')).toHaveAttribute('data-photography-accent', accent);
    const search = page.getByLabel('Search photos', { exact: true });
    await search.fill('volleyball'); await search.press('Enter');
    await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('volleyball');
    await expect(page.locator('.photo-card').first()).toBeVisible();
    if (width === 390) await page.getByRole('button', { name: 'Open filters', exact: true }).click();
    const filters = width === 390 ? page.getByRole('dialog', { name: 'Filter options' }) : page;
    await filters.getByRole('button', { name: 'Division', exact: true }).click();
    await filters.getByRole('button', { name: 'Girls', exact: true }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get('division')).toBe('girls');
    await expect(filters.getByRole('button', { name: 'Girls', exact: true })).toHaveAttribute('aria-pressed', 'true');
    if (width === 390) { await capture(page, `${accent}-${width}-filters`); await page.getByRole('button', { name: 'View photos', exact: true }).click(); }
    await expect(page.getByRole('button', { name: 'Remove filter: Division: Girls' })).toBeVisible();
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await capture(page, `${accent}-${width}-search`);
    const card = page.locator('.photo-card').first();
    await card.click();
    const viewer = page.getByRole('dialog', { name: 'Photo lightbox' });
    await expect(viewer).toBeVisible();
    await viewer.getByRole('button', { name: 'Save photograph', exact: true }).click();
    await expect(viewer.getByRole('button', { name: 'Saved · Remove', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await viewer.locator('img').evaluateAll(images => Promise.all(images.map(img => img.decode().catch(() => {}))));
    await capture(page, `${accent}-${width}-viewer`);
    await viewer.getByRole('button', { name: 'Saved · Remove', exact: true }).click();
    const undo = viewer.getByRole('button', { name: 'Undo', exact: true });
    await expect(undo).toBeVisible();
    await undo.focus(); await page.keyboard.press('Enter');
    await expect(viewer.getByRole('button', { name: 'Saved · Remove', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await viewer.getByRole('button', { name: 'Close lightbox', exact: true }).click();
    await expect(card).toBeFocused();
    await page.getByRole('link', { name: /^Saved/ }).click();
    await expect(page.locator('.photo-card')).toHaveCount(1);
    await page.reload(); await expect(page.locator('.photo-card')).toHaveCount(1);
    await capture(page, `${accent}-${width}-saved`);
    records.push({ name: `${accent}-${width}-journey`, submittedSearch: true, selectedFilter: true, viewerSaveAndKeyboardUndo: true, returnedFocus: true, reloadPersisted: true });
    await context.close();
  }
  const context = await browser.newContext({ viewport: { width: 320, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto('http://photo-accent.localhost:8841/photography/explore?study-accent=cool');
  await expect(page.locator('.photo-card').first()).toBeVisible();
  await capture(page, 'cool-320-reduced-motion');
  await page.locator('.photo-card').first().click();
  await expect(page.getByRole('dialog', { name: 'Photo lightbox' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.getAnimations().filter(animation => animation.playState === 'running').length)).toBe(0);
  await capture(page, 'cool-320-viewer');
  await context.close();
} finally {
  await writeFile(join(out, 'encounters.json'), JSON.stringify(records, null, 2) + '\n');
  await browser.close();
}
