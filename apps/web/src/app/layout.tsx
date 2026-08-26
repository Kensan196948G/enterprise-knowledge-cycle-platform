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
      {/* App Router root layout is the documented place for this; @next/next/no-page-custom-font only applies to pages/_document.js */}
      {/* eslint-disable @next/next/no-page-custom-font */}
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+JP:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      {/* eslint-enable @next/next/no-page-custom-font */}
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
