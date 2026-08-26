import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "Segoe UI", "Roboto", "sans-serif"],
      },
      keyframes: {
        fadeUp: {
          from: { opacity: "0", transform: "translateY(14px) scale(.98)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        shimmer: {
          from: { backgroundPosition: "200% 0" },
          to: { backgroundPosition: "-200% 0" },
        },
      },
      animation: {
        "fade-up": "fadeUp .45s cubic-bezier(.22,1,.36,1) both",
        shimmer: "shimmer 1.4s infinite",
      },
    },
  },
  plugins: [],
};

export default config;
