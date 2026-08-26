"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth, hasAtLeastRole } from "@/lib/auth-context";
import { api } from "@/lib/api-client";

interface NavLink {
  href: string;
  label: string;
  ico: string;
  min: string;
  badge?: number;
}

interface NavGroup {
  group: string;
  links: NavLink[];
}

const ROLE_LABEL: Record<string, string> = {
  user: "一般利用者",
  contributor: "登録者",
  reviewer: "レビュー担当",
  approver: "承認権限者",
  admin: "システム管理者",
};

const TITLES: Record<string, [string, string]> = {
  "/": ["ホーム", "今日のタスクとナレッジ循環の状況"],
  "/search": ["検索・活用", "承認済み知見を優先表示。未承認候補は参考情報として区別します"],
  "/knowledge": ["知見一覧", "すべての知見と候補"],
  "/register": ["情報登録", "書いた内容をAIがその場で整理します（参考案）"],
  "/review-queue": ["レビューキュー", "確認待ちの知見候補"],
  "/metrics": ["KPI・分析", "ナレッジ循環の健全性を計測"],
  "/audit": ["監査ログ", "誰が・いつ・何を・どの理由で変更したか"],
};

function screenTitle(pathname: string): [string, string] {
  if (pathname.startsWith("/knowledge/")) return ["知見詳細", "根拠資料と履歴つきで確認できます"];
  return TITLES[pathname] ?? TITLES["/"];
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, openMode, demoUsers, switchRole, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [topQ, setTopQ] = useState("");
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (!loading && !user && !openMode) router.replace("/login");
  }, [loading, user, openMode, router]);

  useEffect(() => {
    if (user && hasAtLeastRole(user.role, "reviewer")) {
      api
        .listKnowledge({ status: "review_pending" })
        .then((r) => setPendingCount(r.items.length))
        .catch(() => undefined);
    } else {
      setPendingCount(0);
    }
  }, [user, pathname]);

  if (loading) {
    return <div className="p-8 text-sm text-muted">読み込み中...</div>;
  }
  if (!user) return null;

  const groups: NavGroup[] = [
    {
      group: "ナレッジ",
      links: [
        { href: "/", label: "ホーム", ico: "📊", min: "user" },
        { href: "/search", label: "検索・活用", ico: "🔍", min: "user" },
        { href: "/knowledge", label: "知見一覧", ico: "📚", min: "user" },
      ],
    },
    {
      group: "登録・レビュー",
      links: [
        { href: "/register", label: "情報登録", ico: "✏️", min: "user" },
        { href: "/review-queue", label: "レビューキュー", ico: "🗂️", min: "reviewer", badge: pendingCount },
      ],
    },
    {
      group: "管理",
      links: [
        { href: "/metrics", label: "KPI・分析", ico: "📈", min: "approver" },
        { href: "/audit", label: "監査ログ", ico: "🧾", min: "approver" },
      ],
    },
  ];

  const [title, subtitle] = screenTitle(pathname);

  return (
    <div className="flex h-screen w-full overflow-hidden">
      <aside className="flex w-[250px] shrink-0 flex-col border-r border-borderc bg-white text-subtle">
        <div className="flex items-center gap-3 border-b border-panel px-[18px] py-4">
          <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg bg-accent text-white">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 1 1-3-6.7"></path>
              <path d="M21 3v5h-5"></path>
            </svg>
          </span>
          <div className="leading-tight">
            <p className="text-[14.5px] font-semibold tracking-wide text-ink">ナレッジ循環基盤</p>
            <p className="text-[11px] text-muted">Knowledge Cycle Platform</p>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-2.5">
          {groups.map((g) => {
            const visible = g.links.filter((l) => hasAtLeastRole(user.role, l.min));
            if (visible.length === 0) return null;
            return (
              <div key={g.group}>
                <div className="px-2 pb-1.5 pt-3 text-[10px] font-semibold tracking-widest text-muted">{g.group}</div>
                {visible.map((l) => {
                  const active = pathname === l.href || (l.href === "/knowledge" && pathname.startsWith("/knowledge/"));
                  return (
                    <Link
                      key={l.href}
                      href={l.href}
                      className={`relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium ${
                        active ? "bg-warnBg text-ink" : "text-subtle hover:bg-panel"
                      }`}
                    >
                      {active && <span className="absolute inset-y-2 left-0 w-[3px] rounded-r bg-accent" />}
                      <span className="w-[18px] shrink-0 text-center">{l.ico}</span>
                      <span className="flex-1">{l.label}</span>
                      {!!l.badge && (
                        <span className="rounded-full bg-reject px-1.5 py-px font-mono text-[10.5px] text-white">{l.badge}</span>
                      )}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>
        <div className="flex flex-col gap-2.5 border-t border-panel px-3.5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-[#2A3850] text-[13px] font-semibold text-white">
              {user.name[0]}
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-[13px] font-medium text-ink">{user.name}</p>
              <p className="truncate text-[11px] text-muted">{user.department ?? ROLE_LABEL[user.role]}</p>
            </div>
            <span className="shrink-0 rounded border border-accent/40 px-1.5 py-px text-[10px] font-semibold text-accent">
              {user.role.toUpperCase()}
            </span>
          </div>
          {openMode && (
            <select
              value={user.email ?? ""}
              onChange={(e) => switchRole(e.target.value)}
              className="w-full cursor-pointer rounded-lg border border-borderc bg-white px-2.5 py-1.5 text-xs text-ink outline-none"
            >
              {demoUsers.map((d) => (
                <option key={d.email} value={d.email}>
                  {ROLE_LABEL[d.role] ?? d.role} — {d.name}
                </option>
              ))}
            </select>
          )}
          <button onClick={logout} className="text-left text-[11px] text-muted hover:text-ink">
            {openMode ? "セッション終了" : "ログアウト"}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-[62px] shrink-0 items-center gap-3.5 border-b border-borderc bg-white px-[22px]">
          <div>
            <h1 className="text-[16px] font-semibold leading-tight text-ink">{title}</h1>
            <p className="text-[11.5px] text-muted">{subtitle}</p>
          </div>
          <div className="flex-1" />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (topQ.trim()) router.push(`/search?q=${encodeURIComponent(topQ)}`);
            }}
            className="flex items-center gap-1.5 rounded-lg border border-borderc bg-panel px-2.5 py-1.5 text-muted"
          >
            🔍
            <input
              value={topQ}
              onChange={(e) => setTopQ(e.target.value)}
              placeholder="知見を検索"
              className="w-40 border-none bg-transparent text-[12.5px] text-ink outline-none placeholder:text-muted"
            />
          </form>
          {openMode && (
            <span className="shrink-0 whitespace-nowrap rounded-md bg-aiRefBg px-2.5 py-1.5 text-xs font-semibold text-aiRef">
              MVP検証環境・認証なし
            </span>
          )}
        </header>
        <main className="flex-1 overflow-auto p-[22px]">{children}</main>
      </div>
    </div>
  );
}
