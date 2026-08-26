import { test, expect } from "@playwright/test";

/** 新規登録→削除(自分の下書き)、および他者は削除できないことをRBACで確認する */
test("delete flow: owner can delete own draft, other contributor cannot", async ({ browser }) => {
  const uniqueTitle = `削除テスト用ナレッジ ${Date.now()}`;

  const ctxA = await browser.newContext();
  const pageA = await ctxA.newPage();
  await pageA.goto("/");
  await expect(pageA.getByRole("heading", { name: "ホーム" })).toBeVisible({ timeout: 10000 });
  await pageA.locator("select").selectOption("sato.hanako@example-ekcp.test");
  await pageA.waitForTimeout(500);

  await pageA.goto("/register");
  await pageA.getByPlaceholder(/○○工事/).fill(uniqueTitle);
  await pageA
    .getByPlaceholder(/課題/)
    .fill("課題: 削除フロー確認用の課題記述。結果: 削除フロー確認用の結果記述。適用条件: 削除フロー確認用の適用条件。");
  await pageA.getByRole("button", { name: "登録してAI構造化を確定する" }).click();
  await pageA.waitForURL(/\/knowledge\/[0-9a-f-]+$/, { timeout: 15000 });
  await expect(pageA.getByRole("heading", { name: uniqueTitle })).toBeVisible();
  const detailUrl = pageA.url();

  // 別のcontributorではボタン自体が表示されない(RBAC)
  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();
  await pageB.goto("/");
  await pageB.locator("select").selectOption("ito.makoto@example-ekcp.test");
  await pageB.waitForTimeout(500);
  await pageB.goto(detailUrl);
  await expect(pageB.getByRole("heading", { name: uniqueTitle })).toBeVisible();
  await expect(pageB.getByRole("button", { name: "削除" })).toHaveCount(0);
  await ctxB.close();

  // 登録者本人は削除できる
  pageA.once("dialog", (d) => d.accept());
  await pageA.getByRole("button", { name: "削除" }).click();
  await expect(pageA).toHaveURL(/\/knowledge$/, { timeout: 10000 });
  await expect(pageA.getByText(uniqueTitle)).toHaveCount(0);
  await ctxA.close();
});
