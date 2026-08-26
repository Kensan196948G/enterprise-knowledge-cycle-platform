"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { ApiError } from "@/lib/api-client";

const DEMO_ACCOUNTS = [
  { role: "一般利用者", email: "tanaka.taichi@example-ekcp.test" },
  { role: "登録者(Contributor)", email: "sato.hanako@example-ekcp.test" },
  { role: "レビュー担当", email: "suzuki.ichiro@example-ekcp.test" },
  { role: "承認権限者", email: "takahashi.naoko@example-ekcp.test" },
  { role: "システム管理者", email: "yamamoto.kenji@example-ekcp.test" },
];

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("Ekcp#2026Demo");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "ログインに失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6">
      <div>
        <p className="text-xs font-semibold text-blue-600">Enterprise Knowledge Cycle Platform</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">社内ナレッジ循環基盤</h1>
        <p className="mt-1 text-sm text-slate-500">人 × AIで知見を標準化する循環型ナレッジ基盤（MVP）</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">メールアドレス</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="taro.yamada@example.test"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">パスワード</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? "ログイン中..." : "ログイン"}
        </button>
      </form>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-500">
        <p className="mb-2 font-semibold text-slate-600">デモアカウント（パスワード共通: Ekcp#2026Demo）</p>
        <ul className="space-y-1">
          {DEMO_ACCOUNTS.map((a) => (
            <li key={a.email} className="flex items-center justify-between gap-2">
              <span>{a.role}</span>
              <button
                type="button"
                className="rounded border border-slate-300 px-2 py-0.5 text-blue-600 hover:bg-blue-50"
                onClick={() => setEmail(a.email)}
              >
                {a.email}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
