import { test, expect } from '@playwright/test';

// Base path for the application
const BASE_PATH = '/photography';

/**
 * Visual Regression Tests
 *
 * Captures screenshots of key pages and compares them to baseline images
 * Run with: npm run test -- visual-regression
 */

test.describe('Visual Regression Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Set consistent viewport for screenshots
    await page.setViewportSize({ width: 1920, height: 1080 });
  });

  test('homepage visual regression', async ({ page }) => {
    await page.goto(BASE_PATH);
    await page.waitForLoadState('networkidle');
    
    // Wait for hero image to load
    await page.waitForSelector('img', { timeout: 10000 });
    
    // Capture full page screenshot
    await expect(page).toHaveScreenshot('homepage-full.png', {
      fullPage: true,
      maxDiffPixels: 100, // Allow small differences
    });
  });

  test('explore page visual regression', async ({ page }) => {
    await page.goto(`${BASE_PATH}/explore`);
    await page.waitForLoadState('networkidle');
    
    // Wait for photos to load
    await page.waitForSelector('a[href*="/photo/"], [data-testid="photo-card"]', {
      timeout: 10000,
    });
    
    // Capture viewport screenshot
    await expect(page).toHaveScreenshot('explore-page.png', {
      fullPage: false,
      maxDiffPixels: 200,
    });
  });

  test('timeline page visual regression', async ({ page }) => {
    await page.goto(`${BASE_PATH}/timeline`);
    await page.waitForLoadState('networkidle');
    
    // Wait for timeline to render
    await page.waitForTimeout(2000);
    
    await expect(page).toHaveScreenshot('timeline-page.png', {
      fullPage: false,
      maxDiffPixels: 200,
    });
  });

  test('mobile homepage visual regression', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE size
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    await page.waitForSelector('img', { timeout: 10000 });
    
    await expect(page).toHaveScreenshot('homepage-mobile.png', {
      fullPage: true,
      maxDiffPixels: 100,
    });
  });

  test('mobile explore page visual regression', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(`${BASE_PATH}/explore`);
    await page.waitForLoadState('networkidle');
    
    await page.waitForSelector('a[href*="/photo/"], [data-testid="photo-card"]', {
      timeout: 10000,
    });
    
    await expect(page).toHaveScreenshot('explore-mobile.png', {
      fullPage: false,
      maxDiffPixels: 200,
    });
  });

  test('filter sidebar visual regression', async ({ page }) => {
    await page.goto(`${BASE_PATH}/explore`);
    await page.waitForLoadState('networkidle');
    
    // Wait for sidebar to render
    await page.waitForSelector('[role="complementary"], aside', {
      timeout: 5000,
    });
    
    // Capture filter sidebar area
    const sidebar = page.locator('[role="complementary"], aside').first();
    await expect(sidebar).toHaveScreenshot('filter-sidebar.png', {
      maxDiffPixels: 100,
    });
  });

  test('lightbox visual regression', async ({ page }) => {
    await page.goto(`${BASE_PATH}/explore`);
    await page.waitForLoadState('networkidle');
    
    // Click first photo to open lightbox
    await page.waitForSelector('a[href*="/photo/"], [data-testid="photo-card"]', {
      timeout: 10000,
    });
    
    const firstPhoto = page
      .locator('a[href*="/photo/"], [data-testid="photo-card"]')
      .first();
    await firstPhoto.click();
    
    // Wait for lightbox
    const lightbox = page.locator('[role="dialog"][aria-modal="true"]');
    await expect(lightbox).toBeVisible({ timeout: 5000 });
    
    await expect(lightbox).toHaveScreenshot('lightbox.png', {
      maxDiffPixels: 200,
    });
  });
});

