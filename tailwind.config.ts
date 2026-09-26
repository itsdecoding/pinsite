import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: {
          DEFAULT: "#121110",
          base: "#121110",
          surface: "#181715",
          elevated: "#1E1D1A",
          overlay: "#262421",
          card: "#161514",
          input: "#141312",
        },
        border: {
          subtle: "#262421",
          medium: "#383530",
          strong: "#524E47",
          focus: "#C9A961",
        },
        text: {
          primary: "#F4F4F5",
          secondary: "#A1A1AA",
          muted: "#71717A",
          placeholder: "#8E8E93",
          inverted: "#121110",
        },
        accent: {
          DEFAULT: "#C9A961",
          primary: "#C9A961",
          hover: "#B8954C",
          active: "#A07F3B",
          subtle: "rgba(201, 169, 97, 0.12)",
          border: "rgba(201, 169, 97, 0.28)",
        },
        feedback: {
          success: {
            DEFAULT: "#34D399",
            bg: "rgba(16, 185, 129, 0.12)",
            border: "rgba(16, 185, 129, 0.24)",
            solid: "#10B981",
          },
          warning: {
            DEFAULT: "#FBBF24",
            bg: "rgba(245, 158, 11, 0.12)",
            border: "rgba(245, 158, 11, 0.24)",
            solid: "#F59E0B",
          },
          error: {
            DEFAULT: "#F87171",
            bg: "rgba(239, 68, 68, 0.12)",
            border: "rgba(239, 68, 68, 0.24)",
            solid: "#EF4444",
          },
          info: {
            DEFAULT: "#60A5FA",
            bg: "rgba(59, 130, 246, 0.12)",
            border: "rgba(59, 130, 246, 0.24)",
            solid: "#3B82F6",
          },
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "Inter", "-apple-system", "sans-serif"],
        mono: ["var(--font-geist-mono)", "JetBrains Mono", "monospace"],
      },
      boxShadow: {
        card: "0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.24)",
        popover: "0 10px 25px -5px rgba(0, 0, 0, 0.6), 0 8px 10px -6px rgba(0, 0, 0, 0.4)",
        modal: "0 25px 50px -12px rgba(0, 0, 0, 0.8)",
        glow: "0 0 20px rgba(201, 169, 97, 0.25)",
      },
      borderRadius: {
        sm: "4px",
        md: "6px",
        lg: "8px",
        xl: "12px",
        "2xl": "16px",
      },
    },
  },
  plugins: [],
};

export default config;
