# 🔧 技術資料（エンジニア向け）

このドキュメントはエンジニア・実装担当向けの詳細技術情報です。プロジェクト概要や現在の完成度については [README.md](../README.md) を参照してください。

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
| FR-08 | 自然言語検索 | ✅ 実装済み（TF-IDFコサイン類似度による関連度ランキング + 承認済み優先・参考情報の明示区別） |
| FR-09 | 標準改訂支援 | ⏭️ Phase 2（要件定義書どおりPoC対象外） |
| FR-10 | 効果分析 | ✅ 実装済み（KPI画面、分野別差戻し・却下率や滞留要因分析を含む） |
| FR-11 | 通知 | ⏭️ 未実装（バックログ。レビュー待ち一覧・優先度スコアリング・ホーム画面の推奨アクションで代替） |
| FR-12 | 管理（ロール/分類/AI設定等） | ✅ 実装済み（RBAC + `/settings` 管理画面: ユーザー・ロール管理／AI連携／滞留しきい値／表示設定） |

## 🔒 権限マトリクス（詳細仕様設計書 §13 準拠 + 独自拡張）

`user < contributor < reviewer < approver < admin` の階層で実装（`apps/api/src/lib/rbac.ts`）。

| 操作 | user | contributor | reviewer | approver | admin |
|---|---|---|---|---|---|
| 承認済み知見の閲覧・検索 | ○ | ○ | ○ | ○ | ○ |
| 新規登録（一次情報登録+AI構造化） | ○ | ○ | ○ | ○ | ○ |
| 知見候補の編集（内容修正） | － | ○ | ○ | ○ | ○ |
| 削除（自分が登録した下書き/AI構造化済み/差戻し） | － | ○ | ○ | ○ | ○ |
| 削除（他者の知見。差戻し・却下含む） | － | － | － | ○ | ○ |
| レビュー依頼 | － | ○ | ○ | ○ | ○ |
| 差戻し | － | － | ○ | ○ | ○ |
| 正式承認・却下 | － | － | － | ○ | ○ |
| 廃止(archive)・再確認要求 | － | － | － | ○ | ○ |
| 監査ログ・KPI閲覧 | － | － | － | ○ | ○ |

削除は監査証跡・版管理（詳細仕様設計書§14）を保全するため、**承認済み(approved)・要再確認(revalidation_required)・廃止済み(archived)の知見は削除不可**（廃止(archive)フローを使う）。それ以外のステータスのみ、上表の権限で削除できる。

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

## 🌐 デプロイ手順（MVP・検証環境 = Cloudflare Tunnel）

このポートフォリオの他プロジェクトと同じ規約（`~/.cloudflared/<slug>-config.yml` + systemd）に従う。

```bash
# 1. Cloudflare API TokenでTunnelを作成し、~/.cloudflared/<tunnel-id>.json を生成
#    （cert.pemによるブラウザログイン不要。cfd_tunnel API を直接叩く）

# 2. ~/.cloudflared/ekcp-mvp-config.yml
tunnel: <tunnel-id>
credentials-file: /home/kensan/.cloudflared/<tunnel-id>.json
ingress:
  - hostname: ekcp-mvp.mirai-dx-platform.com
    service: http://127.0.0.1:3210
  - service: http_status:404

# 3. DNS CNAME: ekcp-mvp.mirai-dx-platform.com -> <tunnel-id>.cfargotunnel.com (proxied)

# 4. systemd (/etc/systemd/system/ekcp-mvp-cloudflared.service) で常駐化
sudo systemctl enable --now ekcp-mvp-cloudflared.service

# 5. アプリ本体はサブドメイン1つで完結させるため、Next.jsのrewritesでAPIを
#    同一オリジンにプロキシする(next.config.js の API_PROXY_TARGET)。
#    AUTH_MODE=open を指定して「誰でも閲覧できる」検証環境として起動する。
cd apps/api && AUTH_MODE=open PORT=8210 npm run dev &
cd apps/web && API_PROXY_TARGET=http://127.0.0.1:8210 npm run dev &
```

`ekcp`（本番環境用サブドメイン）は要件定義書どおり未取得・未使用。本番展開時に別途検討する。

## 👤 デモアカウント（パスワード共通: `Ekcp#2026Demo`）

公開URLでは `AUTH_MODE=open` によりパスワード入力なしで下表のロールを切り替えられる。ローカル環境でパスワードログインを試す場合に使用する。

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
# API: 統合テスト24件（Postgresが起動している必要あり。必須受入シナリオ5件+削除RBAC6件を含む）
cd apps/api && npm run test

# Web: 単体テスト
cd apps/web && npm run test

# Web: E2E（実ブラウザ、Playwright。api/webが起動している必要あり）
cd apps/web && npx playwright install chromium && npx playwright test
```

E2E仕様(`apps/web/e2e/`)は3ファイル: `knowledge-cycle.spec.ts`（登録→AI構造化→レビュー→承認→検索のゴールデンパス）、
`open-mode.spec.ts`（`AUTH_MODE=open`時の自動ログイン・ロール切替）、`delete-flow.spec.ts`（削除のRBAC: 本人は削除可・他者は削除不可）。

⚠️ `apps/api/tests/` は `beforeAll` でDBを`truncate`する。ローカルで `npm run test` を実行するとseedしたデモデータが消えるため、実行後は `npm run db:seed` で再投入すること（CIは毎回まっさらなPostgresコンテナを使うため影響なし）。

## 📁 ダミーデータ構成

`apps/api/scripts/seed.ts` が以下を投入する（すべて架空）:

- ユーザー7名（5ロール）
- 一次情報(Source) 8件（設計照査・仮設計画・品質不具合・安全・設備・技術問い合わせ・教育Q&Aの各テーマ）
- 知見(KnowledgeItem) 10件、状態は draft / ai_processed / review_pending / returned / approved×3 / rejected / revalidation_required / archived を網羅
- レビュー履歴・根拠資料リンク・AI実行記録・監査ログ・利用実績(閲覧/検索ヒット/再利用) も連動して投入

## ⚠️ 既知の制約・バックログ

- FR-09（標準改訂支援）・FR-11（通知）は要件定義書どおりPoC後の対象としスコープ外
- 検索・類似知見判定・重複検知は外部APIに依存しない文字bigramベースのTF-IDFコサイン類似度（`apps/api/src/lib/text-similarity.ts`）で実装。埋め込みモデルによるベクトル検索/RAGは詳細仕様設計書のTBD技術選定に依存するため未実装
- 外部情報源連携（Slack/CDE/BIM等）は未接続。手動登録のみ（要件定義書の連携要件はPoC後段階）
- AI構造化はデフォルトでルールベース抽出（秘密情報なしで動作）。`ANTHROPIC_API_KEY` を設定すると実LLM(Claude)経路に自動切替
- 本番デプロイ（`ekcp` サブドメイン、Neon等の本番DB）は今回のタスク範囲外。現状はMVP検証環境（`ekcp-mvp`）のみ
- `AUTH_MODE=open` はMVP検証環境専用。本番相当の環境では絶対に設定しないこと（既定は `secure` = fail-closed）

## 📄 関連文書

- [企画書](./planning/社内ナレッジ循環基盤企画書.html)
- [要件定義書](./planning/社内ナレッジ循環基盤%20要件定義書.html)
- [詳細仕様設計書](./planning/社内ナレッジ循環基盤%20詳細仕様設計書.html)
