import type { Config } from "tailwindcss";

/**
 * ZekerFlex design system — "Zeker van je werk".
 * Ink + warm paper, one signature deep-teal brand with a bright mint accent for
 * dark surfaces. Semantic colours are kept separate from the brand hue.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#0C0E12",
          soft: "#1A1F27",
          700: "#2A313C",
        },
        paper: {
          DEFAULT: "#FCFCFA",
          soft: "#F4F5F1",
          200: "#E9EAE3",
        },
        brand: {
          50: "#E7F5F0",
          100: "#C6E9DE",
          300: "#5FC7A8",
          500: "#0E5C4A",
          600: "#0A4B3C",
          700: "#083A2F",
          mint: "#4FE0A0",
        },
        neutralx: {
          400: "#8A93A0",
          500: "#616B78",
          600: "#4A525E",
        },
        hair: "#E6E7E1",
        hairstrong: "#D6D7CF",
        mintwash: "#E4F8EF",
        ok: "#15803D",
        warn: "#B45309",
        crit: "#B91C1C",
        risk: {
          low: "#15803D",
          medium: "#B45309",
          high: "#B91C1C",
        },
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ['"Instrument Sans"', "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ['"IBM Plex Mono"', "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      borderRadius: {
        xl2: "1.25rem",
        xl3: "1.75rem",
      },
      boxShadow: {
        card: "0 1px 2px rgba(12,14,18,0.04), 0 12px 32px -16px rgba(12,14,18,0.16)",
        lift: "0 2px 8px rgba(12,14,18,0.06), 0 24px 60px -24px rgba(12,14,18,0.28)",
        glow: "0 0 0 1px rgba(79,224,160,0.25), 0 18px 50px -12px rgba(79,224,160,0.35)",
        // Layered, physically-plausible elevation for the app surfaces.
        e1: "0 1px 2px rgba(12,14,18,0.05), 0 4px 10px -4px rgba(12,14,18,0.10)",
        e2: "0 2px 4px rgba(12,14,18,0.05), 0 14px 32px -12px rgba(12,14,18,0.18)",
        e3: "0 4px 8px rgba(12,14,18,0.06), 0 32px 64px -20px rgba(12,14,18,0.28)",
        "inner-hair": "inset 0 0 0 1px rgba(12,14,18,0.06)",
        "mint-ring": "0 0 0 1px rgba(79,224,160,0.4), 0 8px 30px -6px rgba(79,224,160,0.45)",
      },
      maxWidth: {
        shell: "1180px",
      },
      transitionTimingFunction: {
        spring: "cubic-bezier(0.22, 1, 0.36, 1)",
        "out-quint": "cubic-bezier(0.23, 1, 0.32, 1)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-dot": {
          "0%,100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
        "slide-up-fade": {
          "0%": { opacity: "0", transform: "translateY(16px) scale(0.99)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "gradient-pan": {
          "0%,100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
        float: {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
        "glow-pulse": {
          "0%,100%": { opacity: "0.4", transform: "scale(1)" },
          "50%": { opacity: "0.75", transform: "scale(1.05)" },
        },
        "aurora-drift": {
          "0%": { transform: "translate3d(0,0,0) rotate(0deg)" },
          "50%": { transform: "translate3d(3%,-2%,0) rotate(8deg)" },
          "100%": { transform: "translate3d(0,0,0) rotate(0deg)" },
        },
        ticker: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        "ring-sweep": {
          "0%": { strokeDashoffset: "var(--dash, 0)" },
        },
        "count-blur-in": {
          "0%": { opacity: "0", filter: "blur(6px)", transform: "translateY(6px)" },
          "100%": { opacity: "1", filter: "blur(0)", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.6s cubic-bezier(0.22,1,0.36,1) both",
        "pulse-dot": "pulse-dot 1.6s ease-in-out infinite",
        "slide-up-fade": "slide-up-fade 0.6s cubic-bezier(0.22,1,0.36,1) both",
        "scale-in": "scale-in 0.4s cubic-bezier(0.22,1,0.36,1) both",
        shimmer: "shimmer 2.4s linear infinite",
        "gradient-pan": "gradient-pan 8s ease infinite",
        float: "float 6s ease-in-out infinite",
        "glow-pulse": "glow-pulse 5s ease-in-out infinite",
        "aurora-drift": "aurora-drift 18s ease-in-out infinite",
        ticker: "ticker 40s linear infinite",
        "count-blur-in": "count-blur-in 0.5s cubic-bezier(0.22,1,0.36,1) both",
      },
    },
  },
  plugins: [],
};

export default config;
