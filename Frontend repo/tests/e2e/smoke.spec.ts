import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:5173';
const EMAIL = 'superadmin@fincrm.com';
const PASSWORD = 'your-password';

test.describe('AdvisorFlow smoke tests', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[type="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(/dashboard/);
  });

  test('Dashboard loads with KPI cards', async ({ page }) => {
    await expect(page.locator('text=Pipeline')).toBeVisible();
    await expect(page.locator('text=Commission')).toBeVisible();
    await expect(page.locator('text=Active Applications')).toBeVisible();
  });

  test('Flow Intelligence button opens chat', async ({ page }) => {
    await page.click('text=Ask Flow Intelligence');
    await expect(page).toHaveURL(/flow-intelligence/);
    await expect(page.locator('text=Flow Intelligence')).toBeVisible();
  });

  test('Can navigate to all main pages', async ({ page }) => {
    const pages = ['Clients', 'Applications', 'Tasks', 'Commission', 'Rates'];
    for (const p of pages) {
      await page.click(`text=${p}`);
      await expect(page).not.toHaveURL(/error/);
      await page.waitForTimeout(500);
    }
  });

  test('Can create a new client', async ({ page }) => {
    await page.click('text=Clients');
    await page.click('button:has-text("New Client")');
    await page.fill('input[placeholder*="First name"]', 'Test');
    await page.fill('input[placeholder*="Last name"]', 'Playwright');
    await page.fill('input[type="email"]', 'test.playwright@test.com');
    await page.click('button:has-text("Save")');
    await expect(page.locator('text=Test Playwright')).toBeVisible();
  });

  test('Commission page loads data', async ({ page }) => {
    await page.click('text=Commission');
    await expect(page.locator('text=Expected This Month')).toBeVisible();
    await expect(page.locator('text=Commission register')).toBeVisible();
  });

  test('No console errors on dashboard', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.goto(`${BASE}/dashboard`);
    await page.waitForTimeout(2000);
    const realErrors = errors.filter((e) =>
      !e.includes('Download the React DevTools') &&
      !e.includes('favicon')
    );
    expect(realErrors).toHaveLength(0);
  });

  test('Application detail page loads all tabs', async ({ page }) => {
    await page.click('text=Applications');
    await page.click('tr:first-child');
    const tabs = ['Overview', 'Applicants', 'Income', 'Documents'];
    for (const tab of tabs) {
      await page.click(`text=${tab}`);
      await page.waitForTimeout(300);
      await expect(page).not.toHaveURL(/error/);
    }
  });
});
