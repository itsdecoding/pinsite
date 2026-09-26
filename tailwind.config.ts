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
        // Dual-mode canvas and card tokens
        canvas: {
          light: "#F7F5F0",
          dark: "#141210",
        },
        surface: {
          light: "#FFFFFF",
          dark: "#1C1A17",
          darkElevated: "#23201C",
        },
        border: {
          light: "#ECE8E1",
          dark: "#2D2924",
        },
        ink: {
          primary: {
            light: "#111110",
            dark: "#F5F3EF",
          },
          secondary: {
            light: "#6E6B66",
            dark: "#8A8680",
          },
          muted: {
            light: "#9E9A93",
            dark: "#635F59",
          },
        },
        brand: {
          DEFAULT: "#F95721",
          hover: "#E04612",
          active: "#C83B0D",
          subtle: {
            light: "rgba(249, 87, 33, 0.10)",
            dark: "rgba(249, 87, 33, 0.15)",
          },
          border: {
            light: "rgba(249, 87, 33, 0.25)",
            dark: "rgba(249, 87, 33, 0.35)",
          },
        },
        feedback: {
          success: "#10B981",
          warning: "#F59E0B",
          error: "#EF4444",
          info: "#3B82F6",
        },
      },
      borderRadius: {
        "xl": "12px",
        "2xl": "18px",
        "3xl": "24px",
        "4xl": "32px",
      },
      boxShadow: {
        island: "0 4px 20px -2px rgba(0, 0, 0, 0.05), 0 2px 6px -1px rgba(0, 0, 0, 0.03)",
        islandDark: "0 10px 30px -5px rgba(0, 0, 0, 0.6), 0 4px 10px -2px rgba(0, 0, 0, 0.4)",
        card: "0 1px 3px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02)",
      },
    },
  },
  plugins: [],
};

export default config;
