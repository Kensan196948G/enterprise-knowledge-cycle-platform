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

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading) {
    return <div className="p-8 text-sm text-slate-500">読み込み中...</div>;
  }
  if (!user) return null;

  return (
    <div className="min-h-screen">
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
            <div className="text-right">
              <p className="font-medium text-slate-800">{user.name}</p>
              <p className="text-xs text-slate-500">{user.department ?? user.role}</p>
            </div>
            <button onClick={logout} className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50">
              ログアウト
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
