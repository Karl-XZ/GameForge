import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#070b12",
        panel: "#0c121b",
        panel2: "#101823",
        surface: "#0c121b",
        border: "#1d2836",
        text: "#e8edf3",
        muted: "#8593a6",
        primary: "#5eead4",
        primary2: "#f2b66d",
        accent: "#5eead4",
        amber: "#f2b66d",
        rose: "#ff6b9a",
        danger: "#ff6b6b",
      },
      fontFamily: {
        serif: ['"Noto Serif SC"', '"Songti SC"', 'serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(94,234,212,0.04), 0 20px 60px -30px rgba(94,234,212,0.25)",
        teal: "0 0 32px rgba(94,234,212,0.35)",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "0% 50%" },
          "100%": { backgroundPosition: "100% 50%" },
        },
      },
      animation: {
        shimmer: "shimmer 6s ease infinite",
      },
    },
  },
  plugins: [],
};

export default config;
