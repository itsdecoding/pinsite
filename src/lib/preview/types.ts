export type ThemeId =
  | "industrial-slate"
  | "medical-mint"
  | "luxury-obsidian"
  | "electric-azure"
  | "warm-terracotta";

export type FontPairingId =
  | "editorial-newsreader"
  | "tech-grotesk"
  | "modern-clean"
  | "bold-industrial";

export interface ThemeConfig {
  id: ThemeId;
  name: string;
  ink: string;
  ink2: string;
  ink3: string;
  paper: string;
  mist: string;
  line: string;
  mint: string;
  mint2: string;
  teal: string;
  forest: string;
  forest2: string;
  accent: string;
}

export interface ServiceItem {
  title: string;
  description: string;
  imageUrl?: string;
  tag?: string;
}

export interface PillarItem {
  title: string;
  description: string;
  iconName?: "search" | "shield" | "clock" | "heart" | "check" | "zap" | "star";
}

export interface ProcessStep {
  stepNumber: number;
  title: string;
  description: string;
}

export interface TestimonialItem {
  quote: string;
  author: string;
  roleOrLocation: string;
  initials?: string;
}

export interface PreviewSiteData {
  businessName: string;
  tagline?: string;
  niche: string;
  city: string;
  area: string;
  phone: string;
  whatsappNumber?: string;
  fullAddress: string;

  // Aesthetic
  themeId: ThemeId;
  fontPairingId?: FontPairingId;
  customTheme?: Partial<ThemeConfig>;

  // Hero Section
  hero: {
    h1Line1: string;
    h1Line2: string;
    h1Line3Emphasis: string;
    subheadline: string;
    primaryCtaText: string;
    secondaryCtaText: string;
    heroImageUrl?: string;
  };

  // Statement / Philosophy
  philosophy: {
    statementHtml: string;
    ctaText: string;
    tiltImageLeft?: string;
    tiltImageRight?: string;
  };

  // 4 Core Principles / Why Choose Us
  principles: {
    heading: string;
    headingEmphasis: string;
    lede: string;
    pillars: [PillarItem, PillarItem, PillarItem, PillarItem];
  };

  // 6 Services
  servicesSection: {
    heading: string;
    headingEmphasis: string;
    items: ServiceItem[];
  };

  // 5 Step Process
  process: {
    heading: string;
    headingEmphasis: string;
    lede: string;
    steps: [ProcessStep, ProcessStep, ProcessStep, ProcessStep, ProcessStep];
  };

  // Founder / Specialist Spotlight
  founder: {
    name: string;
    nameEmphasis?: string;
    titleOrCredentials: string;
    yearsExperience: string;
    reviewCount: string;
    ratingScore: string;
    bio: string;
    expertiseAreas: [string, string, string];
    imageUrl?: string;
    badgeLocation?: string;
  };

  // Testimonials (3 items)
  reviews: {
    heading: string;
    headingEmphasis: string;
    ratingScore: string;
    ratingSummary: string;
    items: [TestimonialItem, TestimonialItem, TestimonialItem];
  };

  // Location & Timings
  location: {
    headingArea: string;
    headingCity: string;
    morningHours: string;
    eveningHours: string;
    mapQuery: string;
  };

  // Footer & Agency Conversion
  footer: {
    hollowWord: string;
    hollowWordEmphasis: string;
    summary: string;
  };

  // Agency branding wrapper
  agencyBar?: {
    enabled: boolean;
    agencyName: string;
    claimUrl: string;
    targetPhone?: string;
  };
}
