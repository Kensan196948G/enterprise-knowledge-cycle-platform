import type { Metadata } from "next";
import { AuthProvider } from "@/lib/auth-context";
import "./globals.css";

export const metadata: Metadata = {
  title: "社内ナレッジ循環基盤 | Enterprise Knowledge Cycle Platform",
  description: "人×AIで知見を標準化する循環型ナレッジ基盤（MVP）",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
