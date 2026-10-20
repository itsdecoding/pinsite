import { ThemeConfig, ThemeId } from "./types";

export const PREVIEW_THEMES: Record<ThemeId, ThemeConfig> = {
  "industrial-slate": {
    id: "industrial-slate",
    name: "Industrial Slate & Amber",
    ink: "#0F172A",
    ink2: "#334155",
    ink3: "#64748B",
    paper: "#FFFFFF",
    mist: "#F1F5F9",
    line: "#E2E8F0",
    mint: "#FED7AA", // Warm amber highlight
    mint2: "#FDBA74",
    teal: "#EA580C", // Industrial orange accent
    forest: "#0F172A", // Deep slate background
    forest2: "#1E293B",
    accent: "#F97316",
  },
  "medical-mint": {
    id: "medical-mint",
    name: "Clean Dental & Medical Mint",
    ink: "#14181B",
    ink2: "#4A5357",
    ink3: "#69737A",
    paper: "#FFFFFF",
    mist: "#F2F5F4",
    line: "#E1E7E5",
    mint: "#DDEFE9",
    mint2: "#C4E4DA",
    teal: "#1E6E65",
    forest: "#0D2826",
    forest2: "#163634",
    accent: "#D63A44",
  },
  "luxury-obsidian": {
    id: "luxury-obsidian",
    name: "Obsidian & Champagne Gold",
    ink: "#18181B",
    ink2: "#3F3F46",
    ink3: "#71717A",
    paper: "#FFFFFF",
    mist: "#FAFAF9",
    line: "#E7E5E4",
    mint: "#FEF3C7", // Soft champagne gold
    mint2: "#FDE68A",
    teal: "#D97706", // Rich gold
    forest: "#121212", // Deep obsidian
    forest2: "#1C1917",
    accent: "#D97706",
  },
  "electric-azure": {
    id: "electric-azure",
    name: "Cybernetic Azure & Cobalt",
    ink: "#0B0F19",
    ink2: "#334155",
    ink3: "#64748B",
    paper: "#FFFFFF",
    mist: "#F0F6FF",
    line: "#E0E7FF",
    mint: "#DBEAFE", // Soft cyan/blue
    mint2: "#BFDBFE",
    teal: "#2563EB", // Electric blue
    forest: "#090D1A", // Deep night navy
    forest2: "#131C31",
    accent: "#3B82F6",
  },
  "warm-terracotta": {
    id: "warm-terracotta",
    name: "Artisan Terracotta & Earth",
    ink: "#1C1917",
    ink2: "#44403C",
    ink3: "#78716C",
    paper: "#FFFFFF",
    mist: "#FAF7F5",
    line: "#E7E5E4",
    mint: "#FFEDD5", // Soft peach
    mint2: "#FED7AA",
    teal: "#C2410C", // Earth terracotta
    forest: "#241812", // Deep roast espresso
    forest2: "#332219",
    accent: "#EA580C",
  },
};

export function resolveTheme(themeId: ThemeId, overrides?: Partial<ThemeConfig>): ThemeConfig {
  const base = PREVIEW_THEMES[themeId] || PREVIEW_THEMES["medical-mint"];
  return { ...base, ...overrides };
}
