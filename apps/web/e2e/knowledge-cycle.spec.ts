import { test, expect } from "@playwright/test";

const PASSWORD = "Ekcp#2026Demo";
const CONTRIBUTOR = "sato.hanako@example-ekcp.test";
const APPROVER = "takahashi.naoko@example-ekcp.test";
const USER = "tanaka.taichi@example-ekcp.test";

async function login(page: import("@playwright/test").Page, email: string) {
  await page.goto("/login");
  await page.getByPlaceholder("taro.yamada@example.test").fill(email);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: "ログイン" }).click();
  await expect(page).toHaveURL("/");
}

test("golden path: register -> AI structure -> review -> approve -> search", async ({ page }) => {
  const uniqueTitle = `E2Eテスト工事 品質記録 ${Date.now()}`;

  // 1. Contributor registers a source and triggers AI structuring
  await login(page, CONTRIBUTOR);
  await page.goto("/register");
  await page.getByPlaceholder(/○○工事/).fill(uniqueTitle);
  await page
    .getByPlaceholder(/課題: \.\.\. 原因/)
    .fill(
      "課題: 打継目からの漏水が確認された。原因: 止水板の設置間隔が不足していた。" +
        "対応: 止水板を追加設置した。結果: 漏水は解消した。適用条件: 止水板を用いる打継目全般に適用する。",
    );
  await page.getByRole("button", { name: "登録してAI構造化を実行" }).click();
  await expect(page.getByText("AI構造化結果（確認）")).toBeVisible({ timeout: 15000 });

  await page.getByRole("link", { name: "知見詳細でレビュー依頼へ進む" }).click();
  await expect(page.getByRole("heading", { name: uniqueTitle })).toBeVisible();

  await page.getByRole("button", { name: "レビュー依頼" }).click();
  await expect(page.getByText("レビュー依頼を送信しました。")).toBeVisible();

  const url = page.url();

  // 2. Approver approves it
  await login(page, APPROVER);
  await page.goto(url);
  await expect(page.getByText("レビュー待ち")).toBeVisible();
  await page.getByRole("button", { name: "承認", exact: true }).click();
  await expect(page.getByText("承認しました")).toBeVisible();
  await expect(page.getByText("承認済み（正式知見）")).toBeVisible();

  // 3. General user searches and finds it in the approved bucket
  await login(page, USER);
  await page.goto("/search");
  await page.getByPlaceholder("質問または検索語を入力").fill("打継目");
  await page.getByRole("button", { name: "検索" }).click();
  await expect(page.getByText(/承認済み知見 \(\d+件\)/)).toBeVisible();
  await expect(page.getByRole("link", { name: uniqueTitle })).toBeVisible();
});
