import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        approved: "#166534",
        approvedBg: "#eaf8ef",
        aiRef: "#6d28d9",
        aiRefBg: "#f2ecff",
        warn: "#9a4b07",
        warnBg: "#fff2e8",
      },
    },
  },
  plugins: [],
};
export default config;
