import { test, expect } from "@playwright/test";

test("open mode: visiting root auto-logs-in without any credential entry", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { name: "ホーム" })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("MVP検証環境・認証なし")).toBeVisible();
});

test("open mode: role switcher changes identity without a password", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "ホーム" })).toBeVisible({ timeout: 10000 });

  const select = page.locator("select");
  await select.selectOption("takahashi.naoko@example-ekcp.test");
  await page.waitForTimeout(500);
  await page.goto("/audit");
  await expect(page.getByRole("heading", { name: "監査ログ" })).toBeVisible();
});
