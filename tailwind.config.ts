import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "hsl(220 20% 7%)",
        panel: "hsl(220 18% 10%)",
        panel2: "hsl(220 16% 12%)",
        border: "hsl(220 12% 18%)",
        text: "hsl(210 20% 92%)",
        muted: "hsl(215 14% 70%)",
        primary: "hsl(262 83% 64%)",
        primary2: "hsl(190 90% 55%)",
        accent: "hsl(190 90% 55%)",
        danger: "hsl(0 72% 55%)",
      },
      boxShadow: {
        glow: "0 0 40px hsla(262, 83%, 64%, 0.25)",
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
