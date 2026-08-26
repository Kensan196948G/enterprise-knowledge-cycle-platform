import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createApp } from "../src/index.js";
import { db } from "../src/db/client.js";
import { users } from "../src/db/schema.js";
import { hashPassword } from "../src/lib/auth.js";
import { resetDatabase, closeDb, TEST_PASSWORD } from "./setup.js";

const app = createApp();

async function loginAs(email: string) {
  const res = await app.request("/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: TEST_PASSWORD }),
  });
  const body = (await res.json()) as { token: string };
  return body.token;
}

function authed(token: string) {
  return { authorization: `Bearer ${token}`, "content-type": "application/json" };
}

async function createKnowledge(token: string, title: string) {
  const sourceRes = await app.request("/api/v1/sources", {
    method: "POST",
    headers: authed(token),
    body: JSON.stringify({
      title,
      contentText: "課題: テスト用の課題記述。結果: テスト用の結果記述。適用条件: テスト用の適用条件記述。",
    }),
  });
  const source = await sourceRes.json();
  const candRes = await app.request("/api/v1/knowledge/candidates", {
    method: "POST",
    headers: authed(token),
    body: JSON.stringify({ sourceIds: [source.id], title }),
  });
  return candRes.json();
}

describe("knowledge delete RBAC (新規登録/編集/削除のロール区分)", () => {
  let contributorA: { id: string; email: string };
  let contributorB: { id: string; email: string };
  let approverToken: string;
  let contributorAToken: string;
  let contributorBToken: string;
  let userToken: string;

  beforeAll(async () => {
    await resetDatabase();
    const passwordHash = await hashPassword(TEST_PASSWORD);
    const roles = [
      { role: "user" as const, email: "user@test.local" },
      { role: "contributor" as const, email: "contributorA@test.local" },
      { role: "contributor" as const, email: "contributorB@test.local" },
      { role: "reviewer" as const, email: "reviewer@test.local" },
      { role: "approver" as const, email: "approver@test.local" },
    ];
    for (const r of roles) {
      await db.insert(users).values({ name: r.email, email: r.email, passwordHash, role: r.role });
    }
    const [a] = await db.select().from(users).where(eq(users.email, "contributorA@test.local"));
    const [b] = await db.select().from(users).where(eq(users.email, "contributorB@test.local"));
    contributorA = { id: a.id, email: a.email };
    contributorB = { id: b.id, email: b.email };

    userToken = await loginAs("user@test.local");
    contributorAToken = await loginAs(contributorA.email);
    contributorBToken = await loginAs(contributorB.email);
    approverToken = await loginAs("approver@test.local");
  });

  afterAll(async () => {
    await closeDb();
  });

  it("一般利用者(user)もAI構造化まで実行できる(登録の権限バグ修正の確認)", async () => {
    const item = await createKnowledge(userToken, "user権限での登録テスト");
    expect(item.status).toBe("ai_processed");
  });

  it("自分が登録した知見(draft/ai_processed)はcontributorが削除できる", async () => {
    const item = await createKnowledge(contributorAToken, "自分の知見(削除テスト)");
    const res = await app.request(`/api/v1/knowledge/${item.id}`, {
      method: "DELETE",
      headers: authed(contributorAToken),
    });
    expect(res.status).toBe(204);

    const getRes = await app.request(`/api/v1/knowledge/${item.id}`, { headers: authed(approverToken) });
    expect(getRes.status).toBe(404);
  });

  it("他者が登録した知見はcontributorが削除できない(403)", async () => {
    const item = await createKnowledge(contributorAToken, "他者の知見(削除拒否テスト)");
    const res = await app.request(`/api/v1/knowledge/${item.id}`, {
      method: "DELETE",
      headers: authed(contributorBToken),
    });
    expect(res.status).toBe(403);
  });

  it("approverは他者の知見も削除できる", async () => {
    const item = await createKnowledge(contributorAToken, "approverによる削除テスト");
    const res = await app.request(`/api/v1/knowledge/${item.id}`, {
      method: "DELETE",
      headers: authed(approverToken),
    });
    expect(res.status).toBe(204);
  });

  it("承認済み(approved)の知見は削除できない(409, archiveへ誘導)", async () => {
    const item = await createKnowledge(contributorAToken, "承認済み削除拒否テスト");
    const reviewRes = await app.request("/api/v1/reviews", {
      method: "POST",
      headers: authed(contributorAToken),
      body: JSON.stringify({ knowledgeId: item.id }),
    });
    const review = await reviewRes.json();
    const approveRes = await app.request(`/api/v1/reviews/${review.id}/approve`, {
      method: "POST",
      headers: authed(approverToken),
      body: JSON.stringify({}),
    });
    expect(approveRes.status).toBe(200);

    const delRes = await app.request(`/api/v1/knowledge/${item.id}`, {
      method: "DELETE",
      headers: authed(approverToken),
    });
    expect(delRes.status).toBe(409);
  });

  it("削除操作は監査ログにDELETEとして記録される", async () => {
    const item = await createKnowledge(contributorAToken, "監査ログ確認用");
    await app.request(`/api/v1/knowledge/${item.id}`, { method: "DELETE", headers: authed(contributorAToken) });

    const auditRes = await app.request("/api/v1/audit", { headers: authed(approverToken) });
    const body = await auditRes.json();
    expect(body.items.some((i: { action: string; objectId: string }) => i.action === "DELETE" && i.objectId === item.id)).toBe(
      true,
    );
  });
});
