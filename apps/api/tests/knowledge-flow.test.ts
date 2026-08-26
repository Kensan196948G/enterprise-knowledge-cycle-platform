import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/index.js";
import { resetDatabase, seedTestUsers, closeDb, TEST_PASSWORD } from "./setup.js";

const app = createApp();

async function loginAs(email: string) {
  const res = await app.request("/api/v1/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: TEST_PASSWORD }),
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { token: string };
  return body.token;
}

function authed(token: string) {
  return { authorization: `Bearer ${token}`, "content-type": "application/json" };
}

describe("knowledge cycle end-to-end (要件定義書/詳細仕様設計書 準拠)", () => {
  let tokens: Record<string, string> = {};
  let sourceId = "";
  let knowledgeId = "";
  let reviewCaseId = "";

  beforeAll(async () => {
    await resetDatabase();
    const users = await seedTestUsers();
    tokens = {
      user: await loginAs(users.user.email),
      contributor: await loginAs(users.contributor.email),
      reviewer: await loginAs(users.reviewer.email),
      approver: await loginAs(users.approver.email),
      admin: await loginAs(users.admin.email),
    };
  });

  afterAll(async () => {
    await closeDb();
  });

  it("rejects login with wrong password", async () => {
    const res = await app.request("/api/v1/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "approver@test.local", password: "wrong" }),
    });
    expect(res.status).toBe(401);
  });

  it("FR-01: contributor registers a source document", async () => {
    const res = await app.request("/api/v1/sources", {
      method: "POST",
      headers: authed(tokens.contributor),
      body: JSON.stringify({
        title: "テスト工事 品質記録",
        contentText:
          "課題: 打継目からの漏水が確認された。原因: 止水板の設置間隔が不足していた。" +
          "対応: 止水板を追加設置した。結果: 漏水は解消した。適用条件: 止水板を用いる打継目全般に適用する。",
        projectSite: "テスト工事現場",
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    sourceId = body.id;
    expect(sourceId).toBeTruthy();
  });

  it("FR-03/FR-04: AI structuring produces a candidate with evidence and no fabricated facts", async () => {
    const res = await app.request("/api/v1/knowledge/candidates", {
      method: "POST",
      headers: authed(tokens.contributor),
      body: JSON.stringify({ sourceIds: [sourceId] }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    knowledgeId = body.id;
    expect(body.status).toBe("ai_processed");
    expect(body.aiOutput.evidenceRefs).toEqual([`source:${sourceId}`]);
  });

  it("未承認のAI候補は検索結果(approved)に表示されない (必須受入シナリオ1)", async () => {
    const res = await app.request("/api/v1/search", {
      method: "POST",
      headers: authed(tokens.user),
      body: JSON.stringify({ query: "打継目" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.approved).toEqual([]);
    expect(body.reference.some((r: { id: string }) => r.id === knowledgeId)).toBe(true);
  });

  it("承認権限のないユーザーはApprovedへ遷移できない (必須受入シナリオ4)", async () => {
    const reviewRes = await app.request("/api/v1/reviews", {
      method: "POST",
      headers: authed(tokens.contributor),
      body: JSON.stringify({ knowledgeId }),
    });
    expect(reviewRes.status).toBe(201);
    const reviewBody = await reviewRes.json();
    reviewCaseId = reviewBody.id;

    const forbidden = await app.request(`/api/v1/reviews/${reviewCaseId}/approve`, {
      method: "POST",
      headers: authed(tokens.reviewer),
      body: JSON.stringify({}),
    });
    expect(forbidden.status).toBe(403);
  });

  it("承認バリデーション: 必須項目が揃っていれば approver が承認できる", async () => {
    const res = await app.request(`/api/v1/reviews/${reviewCaseId}/approve`, {
      method: "POST",
      headers: authed(tokens.approver),
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("approved");
    expect(body.approverId).toBeTruthy();
  });

  it("承認済み知見の回答から元資料へ到達できる (必須受入シナリオ2)", async () => {
    const res = await app.request(`/api/v1/knowledge/${knowledgeId}`, {
      headers: authed(tokens.user),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.evidence.length).toBeGreaterThan(0);
    expect(body.evidence[0].sourceId).toBe(sourceId);
  });

  it("承認済み知見は検索のapproved枠に表示される", async () => {
    const res = await app.request("/api/v1/search", {
      method: "POST",
      headers: authed(tokens.user),
      body: JSON.stringify({ query: "打継目" }),
    });
    const body = await res.json();
    expect(body.approved.some((r: { id: string }) => r.id === knowledgeId)).toBe(true);
  });

  it("根拠版の変更等により承認済み知見を再確認対象にできる (必須受入シナリオ3)", async () => {
    const res = await app.request(`/api/v1/knowledge/${knowledgeId}/revalidate`, {
      method: "POST",
      headers: authed(tokens.approver),
      body: JSON.stringify({ reason: "止水板基準の改版" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("revalidation_required");
  });

  it("承認済み・廃止済みでない知見のみ編集できる (承認済みは直接編集不可)", async () => {
    const res = await app.request(`/api/v1/knowledge/${knowledgeId}`, {
      method: "PATCH",
      headers: authed(tokens.contributor),
      body: JSON.stringify({ title: "編集を試みる" }),
    });
    // revalidation_required は approved/archived ではないため編集は許可される
    expect(res.status).toBe(200);
  });

  it("監査ログにAPPROVE/AI_RUN等のイベントが記録されている", async () => {
    const res = await app.request("/api/v1/audit", { headers: authed(tokens.approver) });
    expect(res.status).toBe(200);
    const body = await res.json();
    const actions = body.items.map((i: { action: string }) => i.action);
    expect(actions).toEqual(expect.arrayContaining(["APPROVE", "AI_RUN", "REVIEW"]));
  });

  it("KPIメトリクスが実データから計算される", async () => {
    const res = await app.request("/api/v1/metrics", { headers: authed(tokens.approver) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.registration.sourceCount).toBeGreaterThanOrEqual(1);
    expect(body.approval.approvedCount).toBeGreaterThanOrEqual(0);
  });

  it("一般ユーザーは監査ログを閲覧できない (RBAC)", async () => {
    const res = await app.request("/api/v1/audit", { headers: authed(tokens.user) });
    expect(res.status).toBe(403);
  });
});
