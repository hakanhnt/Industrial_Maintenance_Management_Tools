import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#050506",
        graphite: "#121316",
        platinum: "#e7e2d7",
        muted: "#9b978f",
        signal: "#c9f24d",
        copper: "#c8874a",
        cyanline: "#70d6ff"
      },
      boxShadow: {
        glass: "0 24px 80px rgba(0, 0, 0, 0.38)",
        glow: "0 0 48px rgba(201, 242, 77, 0.18)"
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["SFMono-Regular", "ui-monospace", "Consolas", "monospace"]
      }
    }
  },
  plugins: []
};

export default config;
