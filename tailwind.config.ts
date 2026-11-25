import type { Config } from "tailwindcss";

/**
 * Design system: a natural-history catalogue.
 * Warm paper, iron-gall ink, mineral pigments, hairline rules. No glow, no glass.
 */
const ink = "#1B1A17";
const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: "#F2EEE4",
        card: "#FAF8F2",
        inset: "#EAE4D6",
        ink,
        ink2: "#45423B",
        ink3: "#7A7466",
        rule: "#D6CEBD",
        vermilion: "#B8401F",
        verdigris: "#2E6E5C",
        ochre: "#A86F1A",
        indigo: "#2C4A7E",
        // legacy tokens used by the original GameForge players, remapped onto the palette
        bg: "#F2EEE4",
        panel: "#FAF8F2",
        panel2: "#EAE4D6",
        surface: "#FAF8F2",
        border: "#D6CEBD",
        text: ink,
        muted: "#7A7466",
        primary: "#B8401F",
        primary2: "#A86F1A",
        accent: "#2E6E5C",
        amber: "#A86F1A",
        rose: "#B8401F",
        danger: "#A3261A",
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', '"PingFang SC"', '"Hiragino Sans GB"', '"Noto Sans SC"', 'system-ui', 'sans-serif'],
        serif: ['"Noto Serif SC"', '"Songti SC"', 'serif'],
        display: ['"Instrument Serif"', '"Noto Serif SC"', 'serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        plate: "0 1px 0 rgba(27,26,23,0.04), 0 12px 32px -18px rgba(27,26,23,0.18)",
        lift: "0 24px 60px -24px rgba(27,26,23,0.35)",
      },
      borderRadius: {
        sm: "2px",
        DEFAULT: "3px",
      },
    },
  },
  plugins: [],
};

export default config;
