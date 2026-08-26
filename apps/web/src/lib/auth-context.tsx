"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api, setToken } from "./api-client";
import type { AuthUser } from "./types";

interface DemoUser {
  email: string;
  name: string;
  role: string;
  department: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  openMode: boolean;
  demoUsers: DemoUser[];
  login: (email: string, password: string) => Promise<void>;
  switchRole: (email: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** MVP検証環境の既定ペルソナ。open mode時、未ログイン訪問者は自動でこのロールとして閲覧開始する */
const DEFAULT_OPEN_MODE_EMAIL = "tanaka.taichi@example-ekcp.test";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [openMode, setOpenMode] = useState(false);
  const [demoUsers, setDemoUsers] = useState<DemoUser[]>([]);
  const router = useRouter();
  const pathname = usePathname();

  const login = useCallback(async (email: string, password: string) => {
    const { token, user: loggedInUser } = await api.login(email, password);
    setToken(token);
    setUser(loggedInUser);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const mode = await api.authMode().catch(() => ({ open: false }));
      if (cancelled) return;
      setOpenMode(mode.open);
      if (mode.open) {
        api
          .demoUsers()
          .then((r) => !cancelled && setDemoUsers(r.items))
          .catch(() => undefined);
      }

      const token = typeof window !== "undefined" ? window.localStorage.getItem("ekcp_token") : null;
      if (token) {
        try {
          const me = await api.me();
          if (!cancelled) setUser(me);
        } catch {
          setToken(null);
        }
      } else if (mode.open && pathname !== "/login") {
        // 認証無効モード: 誰でも即座に閲覧できるよう既定ペルソナで自動ログインする。
        // ただし /login では、明示的なログイン操作(手動フォーム・E2E等)と競合しないよう自動ログインしない。
        await login(DEFAULT_OPEN_MODE_EMAIL, "open").catch(() => undefined);
      }
      if (!cancelled) setLoading(false);
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [login]);

  const loginAndGoHome = useCallback(
    async (email: string, password: string) => {
      await login(email, password);
      router.push("/");
    },
    [login, router],
  );

  const switchRole = useCallback(
    async (email: string) => {
      await login(email, "open");
      router.refresh();
    },
    [login, router],
  );

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    router.push("/login");
  }, [router]);

  return (
    <AuthContext.Provider
      value={{ user, loading, openMode, demoUsers, login: loginAndGoHome, switchRole, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export { hasAtLeastRole, canDeleteKnowledge } from "./rbac";
