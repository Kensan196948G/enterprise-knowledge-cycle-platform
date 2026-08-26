# 📌 社内ナレッジ循環基盤 (Enterprise Knowledge Cycle Platform) — MVP

> 人 × AIで知見を標準化する循環型ナレッジ基盤。
> 現場の経験・トラブル・工夫を、AIが構造化し、人がレビュー・承認して「会社の標準知」へ昇格させる。

このリポジトリは [`docs/planning/`](./docs/planning) の企画書・要件定義書・詳細仕様設計書を上位文書として実装した MVP／PoC です。**本番運用は対象外**（ローカル／Preview環境での動作実証が目的）。

## 📊 MVP判定

**GO**（ローカル環境で主要ユースケースが実際に動作することを確認済み）

- 情報登録 → AI構造化 → 知見候補生成 → 人レビュー → 承認 → 検索・活用 の一連のフローを実ブラウザ（Playwright）で確認
- 8状態（Draft〜Archived）すべてを実データで再現
- API統合テスト16件・フロントエンド単体テスト2件・E2Eテスト1件すべて green
- CI（lint / typecheck / test / build / security audit）green、known vulnerabilities: critical/high = 0

## 🗺️ 全体アーキテクチャ

```text
┌─────────────┐      ┌──────────────────────────┐      ┌──────────────┐
│  apps/web    │ REST │       apps/api            │      │  PostgreSQL  │
│  Next.js 15  │◄────►│  Hono (Node) + Drizzle ORM │◄────►│  (Docker /   │
│  React 19    │      │  JWT認証 / RBAC            │      │   Neon)      │
└─────────────┘      │  ルールベース or Claude API  │      └──────────────┘
                      │  によるAI構造化エンジン      │
                      └──────────────────────────┘
```

情報源(Source) → AI構造化(KnowledgeCandidate, status=ai_processed) → レビュー依頼(ReviewCase)
→ 承認(status=approved) / 差戻し(returned) / 却下(rejected) → 検索・再利用 → 再確認(revalidation_required) / 廃止(archived)

## ✅ 機能要件カバレッジ（要件定義書 §6 準拠）

| ID | 機能 | 実装状況 |
|---|---|---|
| FR-01 | 情報登録 | ✅ 実装済み（`POST /api/v1/sources`, 画面: 情報登録） |
| FR-02 | 情報統合 | ✅ 実装済み（複数sourceIdsを1知見候補へ統合可能） |
| FR-03 | AI構造化 | ✅ 実装済み（ルールベース抽出 + Claude API 任意切替） |
| FR-04 | 知見候補生成 | ✅ 実装済み（facts/inferences/unknowns/conflicts分離出力） |
| FR-05 | AIレビュー支援 | ✅ 実装済み（矛盾・不足・review_questions提示） |
| FR-06 | 人レビュー | ✅ 実装済み（承認・却下・差戻し・エスカレーション） |
| FR-07 | 正式知見管理 | ✅ 実装済み（status=approvedのみ検索で優先露出） |
| FR-08 | 自然言語検索 | ✅ 実装済み（承認済み優先 + 参考情報の明示区別） |
| FR-09 | 標準改訂支援 | ⏭️ Phase 2（要件定義書どおりPoC対象外） |
| FR-10 | 効果分析 | ✅ 実装済み（KPI画面、実データから計測） |
| FR-11 | 通知 | ⏭️ 未実装（バックログ。レビュー待ち一覧で代替） |
| FR-12 | 管理（ロール/分類/AI設定等） | ⏭️ 一部未実装（RBACは実装済み、管理画面UIは未実装） |

## 🔒 権限マトリクス（詳細仕様設計書 §13 準拠）

`user < contributor < reviewer < approver < admin` の階層で実装（`apps/api/src/lib/rbac.ts`）。承認(Approve)は `approver` のみ、監査ログ・KPI閲覧は `approver` 以上。

## 🚀 クイックスタート

```bash
cp .env.example .env

# 1. PostgreSQL起動
docker compose up -d postgres

# 2. API: migration生成・適用・ダミーデータ投入
cd apps/api
npm install
npm run db:generate   # 初回のみ（既にmigrationsがあれば不要）
npm run db:migrate
npm run db:seed        # 架空データ投入。ログイン情報はコンソール出力を参照
npm run dev             # http://localhost:8210

# 3. Web（別ターミナル）
cd apps/web
npm install
npm run dev             # http://localhost:3210
```

Docker Composeで一括起動する場合: `docker compose up -d --build`（web: 3210 / api: 8210 / postgres: 15544）。

## 👤 デモアカウント（パスワード共通: `Ekcp#2026Demo`）

| ロール | メールアドレス |
|---|---|
| 一般利用者 | tanaka.taichi@example-ekcp.test |
| 登録者(Contributor) | sato.hanako@example-ekcp.test / ito.makoto@example-ekcp.test |
| レビュー担当(Reviewer) | suzuki.ichiro@example-ekcp.test / watanabe.kumi@example-ekcp.test |
| 承認権限者(Approver) | takahashi.naoko@example-ekcp.test |
| システム管理者(Admin) | yamamoto.kenji@example-ekcp.test |

人物名・会社名・案件名はすべて架空です。実在の組織・個人とは一切関係ありません。

## 🧪 テスト

```bash
# API: 統合テスト16件（Postgresが起動している必要あり。必須受入シナリオ5件を含む）
cd apps/api && npm run test

# Web: 単体テスト
cd apps/web && npm run test

# Web: E2E（実ブラウザ、Playwright。api/webが起動している必要あり）
cd apps/web && npx playwright install chromium && npx playwright test
```

## 📁 ダミーデータ構成

`apps/api/scripts/seed.ts` が以下を投入する（すべて架空）:

- ユーザー7名（5ロール）
- 一次情報(Source) 8件（設計照査・仮設計画・品質不具合・安全・設備・技術問い合わせ・教育Q&Aの各テーマ）
- 知見(KnowledgeItem) 10件、状態は draft / ai_processed / review_pending / returned / approved×3 / rejected / revalidation_required / archived を網羅
- レビュー履歴・根拠資料リンク・AI実行記録・監査ログ・利用実績(閲覧/検索ヒット/再利用) も連動して投入

## ⚠️ 既知の制約・バックログ

- FR-09（標準改訂支援）・FR-11（通知）・管理画面(UI-10) は要件定義書どおりPoC後の対象としスコープ外
- 検索は全文一致(ILIKE)＋属性検索のみ。ベクトル検索/RAGは詳細仕様設計書のTBD技術選定に依存するため未実装
- 外部情報源連携（Slack/CDE/BIM等）は未接続。手動登録のみ（要件定義書の連携要件はPoC後段階）
- AI構造化はデフォルトでルールベース抽出（秘密情報なしで動作）。`ANTHROPIC_API_KEY` を設定すると実LLM(Claude)経路に自動切替
- 本番デプロイ・Neon/Cloudflareへの実配置は未実施（今回のタスク範囲外）

## 📄 関連文書

- [企画書](./docs/planning/社内ナレッジ循環基盤企画書.html)
- [要件定義書](./docs/planning/社内ナレッジ循環基盤%20要件定義書.html)
- [詳細仕様設計書](./docs/planning/社内ナレッジ循環基盤%20詳細仕様設計書.html)
