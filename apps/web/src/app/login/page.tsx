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

function BrandHeader() {
  return (
    <div className="mb-1.5 flex items-center gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent text-white">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12a9 9 0 1 1-3-6.7"></path>
          <path d="M21 3v5h-5"></path>
        </svg>
      </span>
      <div className="leading-tight">
        <p className="text-[17px] font-bold text-ink">社内ナレッジ循環基盤</p>
        <p className="text-[11.5px] text-muted">Enterprise Knowledge Cycle Platform</p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  const { login, openMode, demoUsers } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [enteringEmail, setEnteringEmail] = useState<string | null>(null);

  async function enterAs(userEmail: string) {
    setError(null);
    setEnteringEmail(userEmail);
    try {
      await login(userEmail, "open");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "開始できませんでした");
    } finally {
      setEnteringEmail(null);
    }
  }

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

  if (openMode) {
    const users =
      demoUsers.length > 0
        ? demoUsers.map((d) => ({ email: d.email, name: d.name, department: d.department, roleLabel: ROLE_LABEL[d.role] ?? d.role }))
        : DEMO_ACCOUNTS.map((a) => ({ email: a.email, name: a.email, department: null, roleLabel: a.role }));
    return (
      <div className="flex min-h-screen items-center justify-center bg-appBg p-6">
        <div className="w-full max-w-[440px] rounded-2xl border border-borderc bg-white p-[30px] shadow-[0_10px_40px_rgba(16,24,40,.10)]">
          <BrandHeader />
          <p className="mb-4 mt-2.5 text-[12.5px] leading-relaxed text-subtle">
            人 × AIで知見を標準化する循環型ナレッジ基盤（MVP）。体験するロールを選んで開始してください。パスワードは不要です。
          </p>
          <div className="flex flex-col gap-1.5">
            {users.map((u) => (
              <button
                key={u.email}
                type="button"
                disabled={enteringEmail !== null}
                onClick={() => enterAs(u.email)}
                className="flex items-center gap-2.5 rounded-lg border border-borderc bg-white px-3.5 py-2.5 text-left font-sans hover:border-accent hover:bg-panel disabled:opacity-60"
              >
                <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-[#2A3850] text-xs font-semibold text-white">
                  {u.name[0]}
                </span>
                <span className="flex-1 leading-tight">
                  <span className="block text-[13px] font-semibold text-ink">{u.roleLabel}</span>
                  <span className="block text-[11px] text-muted">
                    {u.name}
                    {u.department ? ` · ${u.department}` : ""}
                  </span>
                </span>
                <span className="shrink-0 text-xs font-semibold text-accent">
                  {enteringEmail === u.email ? "開始中..." : "開始 →"}
                </span>
              </button>
            ))}
          </div>
          {error && <p className="mt-3 text-sm text-reject">{error}</p>}
          <div className="mt-4 border-t border-appBg pt-3 text-[11px] leading-relaxed text-muted">
            このMVP検証環境はログイン認証を無効化し、どなたでも閲覧・操作できます（ダミーデータのみ使用）。
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6">
      <BrandHeader />
      <p className="-mt-4 text-sm text-muted">人 × AIで知見を標準化する循環型ナレッジ基盤（MVP）</p>

      <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-borderc bg-white p-6 shadow-sm">
        <div>
          <label className="mb-1 block text-sm font-medium text-subtle">メールアドレス</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-borderc px-3 py-2 text-sm outline-none focus:border-accent"
            placeholder="taro.yamada@example.test"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-subtle">パスワード</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-borderc px-3 py-2 text-sm outline-none focus:border-accent"
          />
        </div>
        {error && <p className="text-sm text-reject">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accentHover disabled:opacity-50"
        >
          {submitting ? "ログイン中..." : "ログイン"}
        </button>
      </form>
    </div>
  );
}

const ROLE_LABEL: Record<string, string> = {
  user: "一般利用者",
  contributor: "登録者",
  reviewer: "レビュー担当",
  approver: "承認権限者",
  admin: "システム管理者",
};
