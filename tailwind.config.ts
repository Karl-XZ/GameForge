import type { Config } from "tailwindcss";

/**
 * Design system: game-menu pop.
 * Signal red, jet black and paper white; hard offset shadows, slanted slabs, halftone dots,
 * one acid-yellow accent for "look here". No gradients-as-decoration, no glass, no glow.
 */
const jet = "#0B0B0D";
const red = "#E8132E";
const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        jet,
        pop: red,
        blood: "#A00A1F",
        snow: "#FFFFFF",
        bone: "#F2EFE9",
        volt: "#FFE135",
        steel: "#66666C",
        fog: "#DCD9D2",
        mint: "#00B884",
        // semantic aliases (kept so every screen speaks one vocabulary)
        paper: "#FFFFFF",
        card: "#FFFFFF",
        inset: "#F2EFE9",
        ink: jet,
        ink2: "#2B2B30",
        ink3: "#66666C",
        rule: "#DCD9D2",
        vermilion: red,
        verdigris: "#00A877",
        ochre: "#F2A900",
        indigo: "#2E5BFF",
        // legacy tokens used by the original GameForge players
        bg: jet,
        panel: "#FFFFFF",
        panel2: "#F2EFE9",
        surface: "#FFFFFF",
        border: jet,
        text: jet,
        muted: "#66666C",
        primary: red,
        primary2: "#A00A1F",
        accent: "#00A877",
        amber: "#F2A900",
        rose: red,
        danger: red,
      },
      fontFamily: {
        sans: ['Barlow', '"PingFang SC"', '"Hiragino Sans GB"', '"Noto Sans SC"', 'system-ui', 'sans-serif'],
        cond: ['"Barlow Condensed"', '"Noto Sans SC"', '"PingFang SC"', 'sans-serif'],
        display: ['Anton', '"Noto Sans SC"', '"PingFang SC"', 'Impact', 'sans-serif'],
        cjk: ['"Noto Sans SC"', '"PingFang SC"', 'sans-serif'],
        serif: ['Barlow', '"Noto Sans SC"', '"PingFang SC"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        hard: `6px 6px 0 ${jet}`,
        "hard-sm": `3px 3px 0 ${jet}`,
        "hard-lg": `10px 10px 0 ${jet}`,
        "hard-red": `6px 6px 0 ${red}`,
        "hard-white": "6px 6px 0 #FFFFFF",
        plate: `6px 6px 0 ${jet}`,
        lift: `10px 10px 0 ${jet}`,
      },
      borderRadius: {
        sm: "0px",
        DEFAULT: "0px",
      },
    },
  },
  plugins: [],
};

export default config;
