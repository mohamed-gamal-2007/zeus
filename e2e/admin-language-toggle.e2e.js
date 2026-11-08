// Verifies the admin-panel language switcher fully toggles translations
// (shell nav labels, dir/rtl, and page content) across the admin interface.
// Run: E2E_BASE_URL=https://zeusedu.tech E2E_ADMIN_EMAIL=.. E2E_ADMIN_PASSWORD=.. npx playwright test e2e/admin-language-toggle.e2e.js
import { expect, test } from "@playwright/test";

const TOGGLE_RE = /switch language|تغيير اللغة/i;

test("admin language switcher toggles the whole admin interface to Arabic and back", async ({ page }) => {
  test.setTimeout(120_000);

  // Start in English so the login form labels match.
  await page.addInitScript(() => localStorage.setItem("zeus_lang", "en"));
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email").fill(process.env.E2E_ADMIN_EMAIL);
  await page.getByLabel("Password").fill(process.env.E2E_ADMIN_PASSWORD);
  await page.getByRole("button", { name: /log in/i }).click();
  await expect(page).toHaveURL(/\/admin/);

  // ── English baseline ────────────────────────────────────────────────
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.getByRole("navigation", { name: "Admin navigation" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Users", exact: true })).toBeVisible();
  await expect(page.getByText("Admin console", { exact: true })).toBeVisible();

  // ── Toggle to Arabic ────────────────────────────────────────────────
  await page.getByRole("button", { name: TOGGLE_RE }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("navigation", { name: "قائمة الإدارة" })).toBeVisible();
  await expect(page.getByRole("link", { name: "المستخدمون", exact: true })).toBeVisible();
  await expect(page.getByText("لوحة تحكم الإدارة", { exact: true })).toBeVisible();

  // Page content (not just the shell) must also switch.
  await page.getByRole("link", { name: "المستخدمون", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/users/);
  await expect(page.getByRole("button", { name: "إنشاء حساب مستخدم" })).toBeVisible();

  // ── Toggle back to English ───────────────────────────────────────────
  await page.getByRole("button", { name: TOGGLE_RE }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
  await expect(page.getByRole("link", { name: "Users", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create user account" })).toBeVisible();
});
