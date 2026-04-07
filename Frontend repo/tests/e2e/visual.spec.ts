import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:5173';
const EMAIL = 'superadmin@fincrm.com';
const PASSWORD = 'your-password';

test.describe('Visual regression snapshots', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/dashboard/);
  });

  test('Dashboard visual snapshot', async ({ page }) => {
    await page.waitForTimeout(2000);
    await expect(page).toHaveScreenshot('dashboard.png', {
      maxDiffPixels: 100,
    });
  });

  test('Applications page visual snapshot', async ({ page }) => {
    await page.click('text=Applications');
    await page.waitForTimeout(1500);
    await expect(page).toHaveScreenshot('applications.png', {
      maxDiffPixels: 100,
    });
  });

  test('Commission page visual snapshot', async ({ page }) => {
    await page.click('text=Commission');
    await page.waitForTimeout(1500);
    await expect(page).toHaveScreenshot('commission.png', {
      maxDiffPixels: 100,
    });
  });

  test('Flow Intelligence page visual snapshot', async ({ page }) => {
    await page.click('text=Ask Flow Intelligence');
    await page.waitForTimeout(1500);
    await expect(page).toHaveScreenshot('flow-intelligence.png', {
      maxDiffPixels: 100,
    });
  });
});
