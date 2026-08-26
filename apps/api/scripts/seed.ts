import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import * as schema from "../src/db/schema.js";
import { hashPassword } from "../src/lib/auth.js";
import { structureWithRules, contentHash } from "../src/lib/ai-structuring.js";

/**
 * MVP検証用の架空ダミーデータ投入スクリプト。
 * 人物名・会社名・案件名・現場名はすべて架空であり、実在の組織・個人とは無関係。
 * デモパスワードは本番運用資格情報ではなく、ローカル検証専用の固定値。
 */

const DEMO_PASSWORD = "Ekcp#2026Demo";

const connectionString =
  process.env.DATABASE_URL ?? "postgres://ekcp:ekcp@localhost:15544/ekcp";
const pool = new Pool({ connectionString });
const db = drizzle(pool, { schema });

const USERS = [
  { name: "田中 太一", email: "tanaka.taichi@example-ekcp.test", role: "user" as const, department: "土木部 現場" },
  { name: "佐藤 花子", email: "sato.hanako@example-ekcp.test", role: "contributor" as const, department: "土木部 現場" },
  { name: "伊藤 誠", email: "ito.makoto@example-ekcp.test", role: "contributor" as const, department: "品質保証部" },
  { name: "鈴木 一郎", email: "suzuki.ichiro@example-ekcp.test", role: "reviewer" as const, department: "技術部" },
  { name: "渡辺 久美", email: "watanabe.kumi@example-ekcp.test", role: "reviewer" as const, department: "品質保証部" },
  { name: "高橋 直子", email: "takahashi.naoko@example-ekcp.test", role: "approver" as const, department: "技術部 専門分野責任者" },
  { name: "山本 健二", email: "yamamoto.kenji@example-ekcp.test", role: "admin" as const, department: "情報システム部" },
];

const SOURCE_TEXTS: Array<{ title: string; projectSite: string; content: string }> = [
  {
    title: "北浜地区河川改修工事 コンクリート打設ひび割れ対応記録",
    projectSite: "北浜地区河川改修工事",
    content:
      "課題: 護岸コンクリート打設後、養生期間中に幅0.3mm程度のひび割れが複数箇所で確認された。事象は打設後3日目に発覚した。" +
      "原因: 気温上昇時期の打設であり水和熱によるひび割れが疑われる。配合上のAE剤添加量が規定より少なかったことも要因と考えられる。" +
      "対応: ひび割れ部にエポキシ樹脂注入を実施し、以降の打設ではプレクーリングと養生シートの二重掛けを追加した。" +
      "結果: 追加対策後の打設では同様のひび割れは発生せず、品質が改善した。" +
      "適用条件: 夏季(気温28度以上)のマスコンクリート打設で、部材厚300mm以上の場合に適用する。" +
      "注意: 冬季打設や薄肉部材には本対策をそのまま適用できない。",
  },
  {
    title: "中央大橋補修工事 仮設支保工計画の見直し記録",
    projectSite: "中央大橋補修工事",
    content:
      "課題: 仮設支保工の設置検討時、既設橋脚の残存耐力データが古く、当初計画の支点反力に対し安全率が不足する可能性が判明した。" +
      "原因: 30年前の設計図書を基に計算しており、近年の劣化診断結果が計画に反映されていなかった。" +
      "対応: 最新の劣化診断報告書を取得し、支保工の支点位置を橋脚中心寄りに変更、反力分散のため受け梁を追加した。" +
      "結果: 安全率を計画基準値以上に確保でき、仮設計画審査を通過した。" +
      "適用条件: 供用後20年以上経過した既設橋梁での仮設支保工計画に適用する。" +
      "注意: 劣化診断結果が未取得の橋梁には適用できない。要事前診断。",
  },
  {
    title: "南港地区造成工事 盛土施工の締固め不足トラブル",
    projectSite: "南港地区造成工事",
    content:
      "課題: 盛土施工後の現場密度試験で、複数箇所において規定の締固め度(90%)を下回る結果が発生した。" +
      "原因: 降雨後の含水比が高い状態で施工を継続したため、締固めエネルギーが土に十分伝達しなかった。" +
      "対応: 該当区間を再転圧し、含水比管理を強化。降雨後は含水比試験を実施してから施工再開する運用に変更した。" +
      "結果: 再転圧後の密度試験では規定値をクリアし、手戻りは1区間に留まった。同種不具合は以降発生していない。" +
      "適用条件: 細粒分を多く含む盛土材を用いる造成工事に適用する。" +
      "注意: 砂質土主体の盛土には本対策の効果が限定的な可能性があり、別途検討が必要。",
  },
  {
    title: "臨海バイパス設計照査ノウハウ（排水計画の見落とし防止）",
    projectSite: "臨海バイパス整備工事",
    content:
      "課題: 設計照査段階で、切土区間の縦断勾配変化点付近における排水施設の集水面積計算が過小評価されていることが判明した。" +
      "原因: 標準図をそのまま流用し、現地の実際の集水域を反映していなかった。" +
      "対応: 現地地形図とドローン測量データを用いて集水域を再計算し、側溝断面とグレーチング設置間隔を見直した。" +
      "結果: 施工後の大雨時にも溢水は発生せず、排水性能が確認された。" +
      "適用条件: 縦断勾配が変化する切土区間の排水計画照査に適用する。" +
      "注意: 平坦地や盛土区間には同一の照査観点をそのまま適用できない。",
  },
  {
    title: "西地区改良工事 足場崩壊ヒヤリハット事例",
    projectSite: "西地区建築改良工事",
    content:
      "課題: 強風時に単管足場の一部が変形し、崩壊寸前となるヒヤリハットが発生した。負傷者はいなかった。" +
      "原因: 壁つなぎの設置間隔が図面指示より広く、強風荷重に対する補強が不足していた。" +
      "対応: 全足場の壁つなぎ間隔を再点検し、規定間隔(垂直5.5m以下・水平5.5m以下)を満たすよう追加設置した。" +
      "結果: 再点検後、同種の変形は確認されていない。安全パトロールの点検項目にも追加した。" +
      "適用条件: 高さ8m以上の単管足場で、強風が想定される現場に適用する。" +
      "注意: 低層仮設や短期養生用足場には同一基準をそのまま適用しない。",
  },
  {
    title: "設備更新工事 配管溶接部からの漏水再発防止事例",
    projectSite: "本社ビル設備更新工事",
    content:
      "課題: 配管溶接部から漏水が発生し、過去にも同種の事象が2件記録されていた。" +
      "原因: 溶接後の非破壊検査(浸透探傷試験)を一部工程で省略していたことが判明した。" +
      "対応: 全溶接箇所の検査記録を再整備し、検査省略を禁止する社内チェックリストを作成した。" +
      "結果: チェックリスト運用開始後、同種の漏水は発生していない。" +
      "適用条件: 圧力配管の現場溶接を伴う設備更新工事に適用する。" +
      "注意: 工場製作済みの配管ユニットには本チェックリストの一部項目が対象外となる。",
  },
  {
    title: "技術問い合わせ履歴：杭基礎の支持層確認方法",
    projectSite: "北浜地区河川改修工事",
    content:
      "課題: 若手技術者から、杭基礎の支持層到達確認をどのように行うべきか問い合わせがあった。" +
      "対応: 施工記録(電流値・貫入速度)とボーリング柱状図の照合、および支持層到達後の載荷試験結果を組み合わせて判定する方法を回答した。" +
      "結果: 問い合わせ対応後、同種の問い合わせが減少し、若手教育資料の一部として整理された。" +
      "適用条件: 打込み杭・中掘り杭工法における支持層確認全般に適用する。",
  },
  {
    title: "2年次教育Q&A：型枠支保工の存置期間",
    projectSite: "社内教育（土木部）",
    content:
      "課題: 2年次教育で、型枠支保工の存置期間の考え方について質問が出た。" +
      "対応: セメントの種類・気温・コンクリート強度発現の関係から、存置期間の考え方と関係基準の該当箇所を解説した。" +
      "結果: 教育後の理解度確認テストで正答率が向上した。" +
      "適用条件: 普通コンクリートを用いる一般的な支保工の存置期間検討に適用する。" +
      "注意: 早強セメントや寒中コンクリートの場合は別途基準を確認する必要がある。",
  },
];

async function main() {
  console.log("[seed] inserting demo users ...");
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  for (const u of USERS) {
    await db
      .insert(schema.users)
      .values({ name: u.name, email: u.email, passwordHash, role: u.role, department: u.department })
      .onConflictDoNothing({ target: schema.users.email });
  }
  const allUsers = await db.select().from(schema.users);
  const byEmail = Object.fromEntries(allUsers.map((u) => [u.email, u]));

  const contributor1 = byEmail["sato.hanako@example-ekcp.test"];
  const contributor2 = byEmail["ito.makoto@example-ekcp.test"];
  const reviewer1 = byEmail["suzuki.ichiro@example-ekcp.test"];
  const reviewer2 = byEmail["watanabe.kumi@example-ekcp.test"];
  const approver = byEmail["takahashi.naoko@example-ekcp.test"];
  const generalUser = byEmail["tanaka.taichi@example-ekcp.test"];

  console.log("[seed] inserting sources ...");
  const existingSources = await db.select().from(schema.sources);
  let sourceRows = existingSources;
  if (existingSources.length === 0) {
    sourceRows = [];
    for (const [i, s] of SOURCE_TEXTS.entries()) {
      const owner = i % 2 === 0 ? contributor1 : contributor2;
      const [row] = await db
        .insert(schema.sources)
        .values({
          title: s.title,
          sourceType: "manual",
          originSystem: "web",
          contentText: s.content,
          contentHash: contentHash(s.content),
          projectSite: s.projectSite,
          confidentiality: "internal",
          ownerId: owner.id,
        })
        .returning();
      sourceRows.push(row);
    }
  } else {
    console.log("[seed] sources already present, skipping insert.");
  }

  const existingKnowledge = await db.select().from(schema.knowledgeItems);
  if (existingKnowledge.length > 0) {
    console.log("[seed] knowledge_items already present, skipping. (idempotent re-run)");
    await pool.end();
    return;
  }

  async function structureAndCreate(sourceIndex: number, title?: string) {
    const source = sourceRows[sourceIndex];
    const structured = structureWithRules(source.contentText, [source.id]);
    const [item] = await db
      .insert(schema.knowledgeItems)
      .values({
        title: title ?? source.title,
        status: "ai_processed",
        projectSite: source.projectSite,
        workCategory: structured.fields.workCategory,
        tags: structured.fields.tags,
        issue: structured.fields.issue,
        cause: structured.fields.cause,
        action: structured.fields.action,
        result: structured.fields.result,
        outcomeType: structured.fields.outcomeType,
        applicableConditions: structured.fields.applicableConditions,
        exclusionConditions: structured.fields.exclusionConditions,
        standardsRefs: structured.fields.standardsRefs,
        aiConfidence: structured.aiConfidence,
        aiOutput: structured,
        createdBy: contributor1.id,
      })
      .returning();

    await db.insert(schema.knowledgeSourceLinks).values({ knowledgeId: item.id, sourceId: source.id });
    await db.insert(schema.evidenceLinks).values({
      knowledgeId: item.id,
      sourceId: source.id,
      locationType: "document",
      sourceVersion: source.version,
      verified: true,
    });
    await db.insert(schema.aiExecutions).values({
      knowledgeId: item.id,
      modelId: structured.modelId,
      modelVersion: structured.modelVersion,
      promptVersion: structured.promptVersion,
      inputSourceIds: [source.id],
      latencyMs: structured.latencyMs,
    });
    await db.insert(schema.auditLogs).values({
      actorId: contributor1.id,
      role: "contributor",
      action: "AI_RUN",
      objectType: "knowledge_item",
      objectId: item.id,
    });
    return item;
  }

  async function requestReview(knowledgeId: string, requestedBy: string, assignedTo: string) {
    const [reviewCase] = await db
      .insert(schema.reviewCases)
      .values({ knowledgeId, requestedBy, assignedTo })
      .returning();
    await db
      .update(schema.knowledgeItems)
      .set({ status: "review_pending", updatedAt: new Date() })
      .where(eq(schema.knowledgeItems.id, knowledgeId));
    await db.insert(schema.auditLogs).values({
      actorId: requestedBy,
      role: "contributor",
      action: "REVIEW",
      objectType: "review_case",
      objectId: reviewCase.id,
    });
    return reviewCase;
  }

  async function approve(knowledgeId: string, reviewCaseId: string, approverId: string) {
    const [before] = await db.select().from(schema.knowledgeItems).where(eq(schema.knowledgeItems.id, knowledgeId));
    const [updated] = await db
      .update(schema.knowledgeItems)
      .set({ status: "approved", approverId, approvedAt: new Date(), updatedAt: new Date() })
      .where(eq(schema.knowledgeItems.id, knowledgeId))
      .returning();
    await db
      .update(schema.reviewCases)
      .set({ decision: "approved", decidedAt: new Date(), decidedBy: approverId })
      .where(eq(schema.reviewCases.id, reviewCaseId));
    await db.insert(schema.auditLogs).values({
      actorId: approverId,
      role: "approver",
      action: "APPROVE",
      objectType: "knowledge_item",
      objectId: knowledgeId,
      beforeVersion: before.version,
      afterVersion: updated.version,
    });
    return updated;
  }

  async function returnCase(knowledgeId: string, reviewCaseId: string, reviewerId: string, reason: string) {
    await db
      .update(schema.knowledgeItems)
      .set({ status: "returned", updatedAt: new Date() })
      .where(eq(schema.knowledgeItems.id, knowledgeId));
    await db
      .update(schema.reviewCases)
      .set({ decision: "returned", decidedAt: new Date(), decidedBy: reviewerId, reason })
      .where(eq(schema.reviewCases.id, reviewCaseId));
    await db.insert(schema.auditLogs).values({
      actorId: reviewerId,
      role: "reviewer",
      action: "RETURN",
      objectType: "knowledge_item",
      objectId: knowledgeId,
      reason,
    });
  }

  async function reject(knowledgeId: string, reviewCaseId: string, approverId: string, reason: string) {
    await db
      .update(schema.knowledgeItems)
      .set({ status: "rejected", updatedAt: new Date() })
      .where(eq(schema.knowledgeItems.id, knowledgeId));
    await db
      .update(schema.reviewCases)
      .set({ decision: "rejected", decidedAt: new Date(), decidedBy: approverId, reason })
      .where(eq(schema.reviewCases.id, reviewCaseId));
    await db.insert(schema.auditLogs).values({
      actorId: approverId,
      role: "approver",
      action: "REJECT",
      objectType: "knowledge_item",
      objectId: knowledgeId,
      reason,
    });
  }

  console.log("[seed] building knowledge items across all workflow states ...");

  // 1-3: Approved（標準的な完結フロー） — KPI・検索・類似表示のメインデータ
  for (let i = 0; i < 3; i++) {
    const item = await structureAndCreate(i);
    const rc = await requestReview(item.id, contributor1.id, reviewer1.id);
    await approve(item.id, rc.id, approver.id);
    // 利用実績(参照・再利用)を付与しKPIが非ゼロになるようにする
    await db.insert(schema.usageEvents).values([
      { knowledgeId: item.id, userId: generalUser.id, eventType: "view" },
      { knowledgeId: item.id, userId: generalUser.id, eventType: "search_hit" },
      { knowledgeId: item.id, userId: contributor2.id, eventType: "reuse" },
    ]);
  }

  // 4: Review-Pending（レビュー待ちキュー表示用）
  {
    const item = await structureAndCreate(3);
    await requestReview(item.id, contributor2.id, reviewer2.id);
  }

  // 5: Returned（差戻し。理由付き）
  {
    const item = await structureAndCreate(4);
    const rc = await requestReview(item.id, contributor1.id, reviewer1.id);
    await returnCase(item.id, rc.id, reviewer1.id, "壁つなぎ間隔の再点検範囲が現場全体か一部か不明確です。適用条件に明記してください。");
  }

  // 6: Rejected（却下。理由付き）
  {
    const item = await structureAndCreate(5);
    const rc = await requestReview(item.id, contributor2.id, reviewer2.id);
    await reject(item.id, rc.id, approver.id, "既存の社内標準(配管溶接検査基準)と内容が重複するため、新規知見としては却下し既存標準の参照案内とする。");
  }

  // 7: AI-Processed（AI構造化直後、レビュー未依頼）
  await structureAndCreate(6);

  // 8: Draft（人手登録のみ、AI未処理）
  {
    const source = sourceRows[7];
    await db.insert(schema.knowledgeItems).values({
      title: source.title,
      status: "draft",
      projectSite: source.projectSite,
      issue: "型枠支保工の存置期間に関する教育Q&Aの下書き。AI構造化は未実施。",
      createdBy: contributor2.id,
    });
  }

  // 9: Revalidation-Required（承認済みだったが基準版変更により再確認要求）
  {
    const item = await structureAndCreate(0, "北浜地区河川改修工事 コンクリート打設ひび割れ対応記録（旧基準版）");
    const rc = await requestReview(item.id, contributor1.id, reviewer1.id);
    await approve(item.id, rc.id, approver.id);
    await db
      .update(schema.knowledgeItems)
      .set({ status: "revalidation_required", updatedAt: new Date() })
      .where(eq(schema.knowledgeItems.id, item.id));
    await db.insert(schema.auditLogs).values({
      actorId: byEmail["yamamoto.kenji@example-ekcp.test"].id,
      role: "admin",
      action: "REVALIDATE",
      objectType: "knowledge_item",
      objectId: item.id,
      reason: "参照基準(社内コンクリート施工基準)が改版されたため、内容の再確認が必要です。",
    });
  }

  // 10: Archived（旧版として廃止済み）
  {
    const item = await structureAndCreate(1, "中央大橋補修工事 仮設支保工計画の見直し記録（旧版・廃止）");
    const rc = await requestReview(item.id, contributor1.id, reviewer1.id);
    await approve(item.id, rc.id, approver.id);
    await db
      .update(schema.knowledgeItems)
      .set({ status: "archived", updatedAt: new Date() })
      .where(eq(schema.knowledgeItems.id, item.id));
    await db.insert(schema.auditLogs).values({
      actorId: approver.id,
      role: "approver",
      action: "ARCHIVE",
      objectType: "knowledge_item",
      objectId: item.id,
      reason: "改訂版の知見に置き換えられたため廃止。",
    });
  }

  console.log("[seed] completed.");
  console.log(`[seed] demo login password for all seeded users: ${DEMO_PASSWORD}`);
  console.log("[seed] users:");
  for (const u of USERS) console.log(`  - ${u.role.padEnd(11)} ${u.email}`);
}

main()
  .catch((err) => {
    console.error("[seed] failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
