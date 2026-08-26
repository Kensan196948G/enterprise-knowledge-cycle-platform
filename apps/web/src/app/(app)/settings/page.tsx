"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import type { AdminUser, Role, SystemSettings } from "@/lib/types";

const ROLE_LABEL: Record<Role, string> = {
  user: "一般利用者",
  contributor: "登録者",
  reviewer: "レビュー担当",
  approver: "承認権限者",
  admin: "システム管理者",
};

const ROLE_OPTIONS: Role[] = ["user", "contributor", "reviewer", "approver", "admin"];

export default function SettingsPage() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const [s, u] = await Promise.all([api.getSettings(), api.listUsers()]);
      setSettings(s);
      setUsers(u.items);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) setForbidden(true);
      else setError(err instanceof ApiError ? err.message : "読み込みに失敗しました");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveSettings(patch: Partial<Pick<SystemSettings, "stagnationAlertDays" | "showDemoBanner" | "aiModel">>) {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await api.updateSettings(patch);
      setSettings(updated);
      setMessage("設定を更新しました。");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "更新に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  async function changeUserRole(id: string, role: Role) {
    setError(null);
    setMessage(null);
    try {
      const updated = await api.updateUser(id, { role });
      setUsers((prev) => prev?.map((u) => (u.id === id ? { ...u, role: updated.role } : u)) ?? null);
      setMessage(`${updated.name} のロールを${ROLE_LABEL[updated.role]}に変更しました。`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "ロールの変更に失敗しました");
    }
  }

  if (forbidden) {
    return (
      <div className="mx-auto max-w-[600px] rounded-[10px] border border-borderc bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-semibold text-ink">この画面はシステム管理者のみ利用できます。</p>
        <p className="mt-1 text-xs text-muted">権限が必要な場合はシステム管理者に相談してください。</p>
      </div>
    );
  }

  if (!settings || !users) return <div className="text-sm text-muted">読み込み中...</div>;

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-4">
      {message && <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800">{message}</div>}
      {error && <div className="rounded-lg border border-red-200 bg-rejectBg px-4 py-2 text-sm text-reject">{error}</div>}

      <section className="rounded-[10px] border border-borderc bg-white shadow-sm">
        <div className="border-b border-panel px-5 py-3.5">
          <div className="text-[14px] font-semibold text-ink">ユーザー・ロール管理</div>
          <div className="mt-0.5 text-[11.5px] text-muted">利用者ごとにロールを変更できます。変更は監査ログに記録されます。</div>
        </div>
        <div className="flex flex-col">
          {users.map((u) => (
            <div key={u.id} className="flex items-center gap-3.5 border-b border-panel px-5 py-3 last:border-b-0">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-ink">{u.name}</p>
                <p className="truncate text-[11.5px] text-muted">
                  {u.email}
                  {u.department ? ` · ${u.department}` : ""}
                </p>
              </div>
              <select
                value={u.role}
                disabled={u.id === user?.id}
                onChange={(e) => changeUserRole(u.id, e.target.value as Role)}
                className="rounded-lg border border-borderc bg-white px-2.5 py-1.5 text-xs text-ink outline-none disabled:opacity-50"
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[10px] border border-borderc bg-white p-5 shadow-sm">
        <div className="text-[14px] font-semibold text-ink">AI連携設定</div>
        <div className="mt-0.5 text-[11.5px] text-muted">
          情報登録時のAI構造化に使うモデルを設定します。APIキー自体はサーバー環境変数(ANTHROPIC_API_KEY)で管理し、この画面には値を表示・入力しません。
        </div>
        <div className="mt-4 flex items-center gap-2.5">
          <span
            className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
              settings.aiConfigured ? "bg-approvedBg text-approved" : "bg-panel text-subtle"
            }`}
          >
            {settings.aiConfigured ? "Anthropic API: 設定済み" : "Anthropic API: 未設定（ルールベース抽出で動作中）"}
          </span>
        </div>
        <div className="mt-4 flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-subtle">AIモデル名</label>
          <div className="flex gap-2">
            <input
              value={settings.aiModel}
              onChange={(e) => setSettings({ ...settings, aiModel: e.target.value })}
              className="w-72 rounded-lg border border-borderc px-2.5 py-1.5 text-[13px] outline-none focus:border-accent"
            />
            <button
              disabled={saving}
              onClick={() => saveSettings({ aiModel: settings.aiModel })}
              className="rounded-lg border border-accent bg-accent px-4 py-1.5 text-xs font-semibold text-white hover:bg-accentHover disabled:opacity-50"
            >
              保存
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-[10px] border border-borderc bg-white p-5 shadow-sm">
        <div className="text-[14px] font-semibold text-ink">滞留アラートしきい値</div>
        <div className="mt-0.5 text-[11.5px] text-muted">レビュー待ちの知見が何日経過したら「滞留」として警告表示するかを設定します。</div>
        <div className="mt-4 flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={14}
            value={settings.stagnationAlertDays}
            onChange={(e) => setSettings({ ...settings, stagnationAlertDays: Number(e.target.value) })}
            className="w-20 rounded-lg border border-borderc px-2.5 py-1.5 text-[13px] outline-none focus:border-accent"
          />
          <span className="text-[13px] text-subtle">日</span>
          <button
            disabled={saving}
            onClick={() => saveSettings({ stagnationAlertDays: settings.stagnationAlertDays })}
            className="ml-2 rounded-lg border border-accent bg-accent px-4 py-1.5 text-xs font-semibold text-white hover:bg-accentHover disabled:opacity-50"
          >
            保存
          </button>
        </div>
      </section>

      <section className="rounded-[10px] border border-borderc bg-white p-5 shadow-sm">
        <div className="text-[14px] font-semibold text-ink">表示・運用設定</div>
        <div className="mt-0.5 text-[11.5px] text-muted">MVP検証環境(認証なし)であることを示すバナーの表示可否を設定します。</div>
        <label className="mt-4 flex items-center gap-2.5 text-[13px] text-ink">
          <input
            type="checkbox"
            checked={settings.showDemoBanner}
            onChange={(e) => saveSettings({ showDemoBanner: e.target.checked })}
            className="h-4 w-4 accent-[#E08A2B]"
          />
          MVP検証環境バナーを表示する
        </label>
      </section>
    </div>
  );
}
