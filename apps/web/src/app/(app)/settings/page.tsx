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

const inputClass = "rounded-lg border border-borderc px-2.5 py-1.5 text-[13px] outline-none focus:border-accent";

export default function SettingsPage() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    setError(null);
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

  async function saveUserEdit(id: string, patch: { name: string; email: string; department: string | null }) {
    setError(null);
    setMessage(null);
    try {
      const updated = await api.updateUser(id, patch);
      setUsers((prev) => prev?.map((u) => (u.id === id ? { ...u, ...updated } : u)) ?? null);
      setMessage(`${updated.name} の情報を更新しました。`);
      setEditingId(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "更新に失敗しました");
    }
  }

  async function deleteUser(u: AdminUser) {
    if (!window.confirm(`${u.name}（${u.email}）を削除します。この操作は取り消せません。よろしいですか？`)) return;
    setError(null);
    setMessage(null);
    try {
      await api.deleteUser(u.id);
      setUsers((prev) => prev?.filter((x) => x.id !== u.id) ?? null);
      setMessage(`${u.name} を削除しました。`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "削除に失敗しました");
    }
  }

  async function createUser(input: { name: string; email: string; role: Role; department: string | null; password: string }) {
    setError(null);
    setMessage(null);
    try {
      const created = await api.createUser(input);
      setUsers((prev) => [...(prev ?? []), created]);
      setMessage(`${created.name} を追加しました。`);
      setCreating(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "追加に失敗しました");
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

  if (error && (!settings || !users)) {
    return (
      <div className="mx-auto max-w-[600px] rounded-[10px] border border-borderc bg-white p-8 text-center shadow-sm">
        <p className="text-sm text-reject">{error}</p>
        <button
          onClick={() => load()}
          className="mt-3 rounded-lg border border-accent bg-accent px-4 py-1.5 text-xs font-semibold text-white hover:bg-accentHover"
        >
          再試行
        </button>
      </div>
    );
  }

  if (!settings || !users) return <div className="text-sm text-muted">読み込み中...</div>;

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-4">
      {message && <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800">{message}</div>}
      {error && <div className="rounded-lg border border-red-200 bg-rejectBg px-4 py-2 text-sm text-reject">{error}</div>}

      <section className="rounded-[10px] border border-borderc bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-panel px-5 py-3.5">
          <div>
            <div className="text-[14px] font-semibold text-ink">ユーザー・ロール管理</div>
            <div className="mt-0.5 text-[11.5px] text-muted">利用者の追加・編集・削除・ロール変更ができます。変更は監査ログに記録されます。</div>
          </div>
          <div className="flex-1" />
          <button
            onClick={() => setCreating((v) => !v)}
            className="shrink-0 rounded-lg border border-accent bg-accent px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-accentHover"
          >
            {creating ? "キャンセル" : "+ 新規追加"}
          </button>
        </div>

        {creating && <CreateUserForm onCreate={createUser} onCancel={() => setCreating(false)} />}

        <div className="flex flex-col">
          {users.map((u) =>
            editingId === u.id ? (
              <EditUserRow key={u.id} user={u} onSave={(patch) => saveUserEdit(u.id, patch)} onCancel={() => setEditingId(null)} />
            ) : (
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
                <button
                  onClick={() => setEditingId(u.id)}
                  className="shrink-0 rounded-md border border-borderc px-2.5 py-1 text-[11px] font-semibold text-subtle hover:bg-panel"
                >
                  編集
                </button>
                <button
                  onClick={() => deleteUser(u)}
                  disabled={u.id === user?.id}
                  className="shrink-0 rounded-md border border-red-200 px-2.5 py-1 text-[11px] font-semibold text-reject hover:bg-rejectBg disabled:opacity-40"
                >
                  削除
                </button>
              </div>
            ),
          )}
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
            disabled={saving || !Number.isFinite(settings.stagnationAlertDays) || settings.stagnationAlertDays < 1 || settings.stagnationAlertDays > 14}
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

function CreateUserForm({
  onCreate,
  onCancel,
}: {
  onCreate: (input: { name: string; email: string; role: Role; department: string | null; password: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [department, setDepartment] = useState("");
  const [role, setRole] = useState<Role>("user");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  return (
    <div className="flex flex-col gap-2.5 border-b border-panel bg-panel/40 px-5 py-4">
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="氏名" className={inputClass} />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="メールアドレス" className={inputClass} />
        <input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="所属部署（任意）" className={inputClass} />
        <select value={role} onChange={(e) => setRole(e.target.value as Role)} className={inputClass}>
          {ROLE_OPTIONS.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="初期パスワード（8文字以上）"
          type="text"
          className={inputClass}
        />
      </div>
      <div className="flex gap-2">
        <button
          disabled={submitting || !name.trim() || !email.trim() || password.length < 8}
          onClick={async () => {
            setSubmitting(true);
            await onCreate({ name: name.trim(), email: email.trim(), role, department: department.trim() || null, password });
            setSubmitting(false);
          }}
          className="rounded-lg border border-accent bg-accent px-4 py-1.5 text-xs font-semibold text-white hover:bg-accentHover disabled:opacity-50"
        >
          追加
        </button>
        <button onClick={onCancel} className="rounded-lg border border-borderc px-4 py-1.5 text-xs font-semibold text-subtle">
          キャンセル
        </button>
      </div>
    </div>
  );
}

function EditUserRow({
  user,
  onSave,
  onCancel,
}: {
  user: AdminUser;
  onSave: (patch: { name: string; email: string; department: string | null }) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [department, setDepartment] = useState(user.department ?? "");
  const [submitting, setSubmitting] = useState(false);

  return (
    <div className="flex flex-col gap-2.5 border-b border-panel bg-panel/40 px-5 py-3.5 last:border-b-0">
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="氏名" className={inputClass} />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="メールアドレス" className={inputClass} />
        <input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="所属部署" className={inputClass} />
      </div>
      <div className="flex gap-2">
        <button
          disabled={submitting || !name.trim() || !email.trim()}
          onClick={async () => {
            setSubmitting(true);
            await onSave({ name: name.trim(), email: email.trim(), department: department.trim() || null });
            setSubmitting(false);
          }}
          className="rounded-lg border border-accent bg-accent px-4 py-1.5 text-xs font-semibold text-white hover:bg-accentHover disabled:opacity-50"
        >
          保存
        </button>
        <button onClick={onCancel} className="rounded-lg border border-borderc px-4 py-1.5 text-xs font-semibold text-subtle">
          キャンセル
        </button>
      </div>
    </div>
  );
}
