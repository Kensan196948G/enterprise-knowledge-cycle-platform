import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "'IBM Plex Sans JP'",
          "system-ui",
          "-apple-system",
          "'Hiragino Kaku Gothic ProN'",
          "Meiryo",
          "sans-serif",
        ],
        mono: ["'IBM Plex Mono'", "monospace"],
      },
      colors: {
        // ステータス系（詳細仕様設計書 §11 表示ルール: 承認済み=緑系 / AI生成・参考=紫系 / 要確認=橙系）
        approved: "#1F8255",
        approvedBg: "#E4F3EC",
        aiRef: "#6B45B0",
        aiRefBg: "#EDE7F6",
        warn: "#B5701A",
        warnBg: "#FDEFE0",
        reject: "#C5392F",
        rejectBg: "#FCE9E7",
        // ベースパレット
        accent: "#E08A2B",
        accentHover: "#C9781F",
        ink: "#1A2433",
        muted: "#8A97A8",
        subtle: "#5A6678",
        borderc: "#E3E8EF",
        panel: "#F2F4F8",
        appBg: "#EEF1F5",
      },
    },
  },
  plugins: [],
};
export default config;
