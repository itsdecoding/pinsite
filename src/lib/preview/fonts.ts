export type FontPairingId =
  | "editorial-newsreader"
  | "tech-grotesk"
  | "modern-clean"
  | "bold-industrial";

export interface FontConfig {
  id: FontPairingId;
  name: string;
  googleFontsUrl: string;
  serifFamily: string;
  sansFamily: string;
}

export const FONT_PAIRINGS: Record<FontPairingId, FontConfig> = {
  "editorial-newsreader": {
    id: "editorial-newsreader",
    name: "Editorial Elegance (Newsreader + Schibsted)",
    googleFontsUrl:
      "https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@1,6..72,400;1,6..72,500&family=Schibsted+Grotesk:wght@400;500;600;700&display=swap",
    serifFamily: '"Newsreader", Georgia, serif',
    sansFamily: '"Schibsted Grotesk", system-ui, sans-serif',
  },
  "tech-grotesk": {
    id: "tech-grotesk",
    name: "Cybernetic Grotesk (Space Grotesk + Plus Jakarta)",
    googleFontsUrl:
      "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap",
    serifFamily: '"Space Grotesk", -apple-system, sans-serif',
    sansFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
  },
  "modern-clean": {
    id: "modern-clean",
    name: "Modern Minimal (Outfit + Inter)",
    googleFontsUrl:
      "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Outfit:wght@500;600;700&display=swap",
    serifFamily: '"Outfit", system-ui, sans-serif',
    sansFamily: '"Inter", -apple-system, sans-serif',
  },
  "bold-industrial": {
    id: "bold-industrial",
    name: "Bold Industrial (Syne + DM Sans)",
    googleFontsUrl:
      "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Syne:wght@600;700;800&display=swap",
    serifFamily: '"Syne", sans-serif',
    sansFamily: '"DM Sans", -apple-system, sans-serif',
  },
};

export function resolveFontConfig(fontId?: FontPairingId): FontConfig {
  if (fontId && FONT_PAIRINGS[fontId]) {
    return FONT_PAIRINGS[fontId];
  }
  return FONT_PAIRINGS["editorial-newsreader"];
}
