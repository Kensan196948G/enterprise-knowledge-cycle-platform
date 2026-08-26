"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth, hasAtLeastRole } from "@/lib/auth-context";

const NAV = [
  { href: "/", label: "ホーム", min: "user" },
  { href: "/search", label: "検索", min: "user" },
  { href: "/knowledge", label: "知見一覧", min: "user" },
  { href: "/register", label: "情報登録", min: "user" },
  { href: "/review-queue", label: "レビューキュー", min: "reviewer" },
  { href: "/metrics", label: "KPI", min: "approver" },
  { href: "/audit", label: "監査ログ", min: "approver" },
];

const ROLE_LABEL: Record<string, string> = {
  user: "一般利用者",
  contributor: "登録者",
  reviewer: "レビュー担当",
  approver: "承認権限者",
  admin: "システム管理者",
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, openMode, demoUsers, switchRole, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user && !openMode) router.replace("/login");
  }, [loading, user, openMode, router]);

  if (loading) {
    return <div className="p-8 text-sm text-slate-500">読み込み中...</div>;
  }
  if (!user) return null;

  return (
    <div className="min-h-screen">
      {openMode && (
        <div className="bg-aiRef px-6 py-1.5 text-center text-xs font-medium text-white">
          このMVP検証環境はログイン認証を無効化し、どなたでも閲覧・操作できます（ダミーデータのみ使用）
        </div>
      )}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div>
            <p className="text-[11px] font-semibold text-blue-600">Enterprise Knowledge Cycle Platform</p>
            <p className="text-sm font-bold text-slate-900">社内ナレッジ循環基盤</p>
          </div>
          <nav className="flex items-center gap-1">
            {NAV.filter((n) => hasAtLeastRole(user.role, n.min)).map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                  pathname === n.href ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3 text-sm">
            {openMode ? (
              <label className="flex flex-col text-xs text-slate-500">
                体験するロールを選択
                <select
                  value={user.email ?? ""}
                  onChange={(e) => switchRole(e.target.value)}
                  className="mt-0.5 rounded border border-slate-300 px-2 py-1 text-sm text-slate-800"
                >
                  {demoUsers.map((d) => (
                    <option key={d.email} value={d.email}>
                      {ROLE_LABEL[d.role] ?? d.role} — {d.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="text-right">
                <p className="font-medium text-slate-800">{user.name}</p>
                <p className="text-xs text-slate-500">{user.department ?? user.role}</p>
              </div>
            )}
            <button onClick={logout} className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50">
              {openMode ? "セッション終了" : "ログアウト"}
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
