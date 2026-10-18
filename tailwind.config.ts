import type { Config } from "tailwindcss";
import { OPACITY_STEPS, RADIUS } from "./client/src/components/xpot/surface";

export default {
  darkMode: ["class"],
  content: ["./client/index.html", "./client/src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      borderRadius: {
        lg: ".5625rem",
        md: ".375rem",
        sm: ".1875rem",
        // The Xpot radius scale (components/xpot/surface.ts RADIUS):
        // rounded-control (inputs, buttons), rounded-card, rounded-sheet (dialogs, sheets).
        ...RADIUS,
      },
      // Off-scale alpha steps the screens use (text-white/32, border-white/12…).
      // Tailwind 3 only generates multiples of 5, so without these the classes
      // silently render nothing.
      opacity: OPACITY_STEPS,
      colors: {
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        border: "var(--border)",
        card: "hsl(var(--card) / <alpha-value>)",
        popover: "hsl(var(--popover) / <alpha-value>)",
        primary: {
          DEFAULT: "hsl(var(--primary) / <alpha-value>)",
          foreground: "hsl(var(--primary-foreground) / <alpha-value>)",
        },
        secondary: "hsl(var(--secondary) / <alpha-value>)",
        muted: {
          DEFAULT: "hsl(var(--muted) / <alpha-value>)",
          foreground: "hsl(var(--muted-foreground) / <alpha-value>)",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
        display: ["var(--font-display)"],
      },
      keyframes: {
        // DotsLoader (components/ui/spinner.tsx): each dot swells and brightens in turn.
        "dot-pulse": {
          "0%, 80%, 100%": { transform: "scale(0.6)", opacity: "0.4" },
          "40%": { transform: "scale(1)", opacity: "1" },
        },
      },
      animation: {
        "dot-pulse": "dot-pulse 1.2s ease-in-out infinite both",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
