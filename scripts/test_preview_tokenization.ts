import fs from "fs";
import path from "path";
import { PreviewSiteData } from "../src/lib/preview/types";
import { renderPreviewHtml } from "../src/lib/preview/renderer";

const roofingMock: PreviewSiteData = {
  businessName: "Apex Commercial Roofing",
  tagline: "Industrial & Flat Roofing Specialists",
  niche: "Commercial Roofing",
  city: "Fort Worth",
  area: "Tarrant County",
  phone: "(817) 555-0192",
  whatsappNumber: "18175550192",
  fullAddress: "4200 Airport Fwy, Fort Worth, TX 76117",
  themeId: "industrial-slate",
  fontPairingId: "bold-industrial",
  hero: {
    h1Line1: "Commercial",
    h1Line2: "roofing built",
    h1Line3Emphasis: "tough.",
    subheadline:
      "TPO single-ply membranes, silicone coatings, and 24/7 emergency hail restoration across Dallas-Fort Worth.",
    primaryCtaText: "Book Inspection",
    secondaryCtaText: "View Systems",
  },
  philosophy: {
    statementHtml:
      "Every facility begins with <em>a zero-leak warranty.</em> You see what <b>our drone sensors detect</b>, get <em>itemized line items</em> in plain English, and approve <b>the timeline</b> before a single shingle is touched.",
    ctaText: "Meet Master Roofer",
  },
  principles: {
    heading: "Four standards building managers",
    headingEmphasis: "demand most",
    lede: "In commercial facilities, delays cost millions. We guarantee punctuality, Class 4 impact resilience, and direct insurance documentation.",
    pillars: [
      {
        title: "Thermal Drone Inspection",
        description: "Infrared moisture mapping pinpoints subsurface leaks without invasive tearing.",
      },
      {
        title: "Class 4 Hail Resistance",
        description: "UL 2218 rated modified bitumen and TPO built for severe North Texas weather.",
      },
      {
        title: "Zero Facility Downtime",
        description: "Off-hours installation and fume mitigation ensure your tenant operations never stop.",
      },
      {
        title: "Master Certified Crews",
        description: "OSHA-30 supervisors on every deck with 20-year non-prorated manufacturer warranties.",
      },
    ],
  },
  servicesSection: {
    heading: "Engineered for Texas storms,",
    headingEmphasis: "warrantied for decades.",
    items: [
      {
        title: "TPO Single-Ply Membrane",
        description: "Reflective 60-mil white roofing that cuts summer HVAC cooling loads by up to 28%.",
      },
      {
        title: "Silicone Restoration Coatings",
        description: "Seamless fluid-applied restoration that extends existing flat roof lifespan by 15 years.",
      },
      {
        title: "Emergency Hail Tarping",
        description: "2-hour dispatch for rapid mitigation and immediate drone claim documentation.",
      },
      {
        title: "Standing Seam Metal",
        description: "Commercial architectural steel with 140mph wind uplift ratings.",
      },
      {
        title: "Modified Bitumen Multi-Ply",
        description: "Heavy-duty redundant waterproofing for high-traffic industrial roofs.",
      },
      {
        title: "Drainage & Scupper Retrofits",
        description: "Eliminates standing water ponding and structural load risks.",
      },
    ],
  },
  process: {
    heading: "From storm damage to final sign-off,",
    headingEmphasis: "step by step.",
    lede: "A transparent commercial workflow that keeps owners and facility managers fully in control.",
    steps: [
      { stepNumber: 1, title: "Thermal Drone Flight", description: "3D moisture mapping in 45 minutes." },
      { stepNumber: 2, title: "Engineering Assessment", description: "Substrate and core sample verification." },
      { stepNumber: 3, title: "Adjuster Negotiation", description: "Direct evidence submission for full claims." },
      { stepNumber: 4, title: "Precision Deployment", description: "Staged tear-off and certified install." },
      { stepNumber: 5, title: "20-Year Certification", description: "Final manufacturer inspection and sign-off." },
    ],
  },
  founder: {
    name: "Marcus Vance",
    nameEmphasis: "Lead Superintendent",
    titleOrCredentials: "CRCA Master Roofer & OSHA-30",
    yearsExperience: "18+",
    reviewCount: "240",
    ratingScore: "4.9",
    bio: "Marcus has directed over 4.2 million square feet of commercial roofing across North Texas. Known for meticulous safety compliance and zero-leak track record.",
    expertiseAreas: ["TPO & PVC Single-Ply", "Commercial Coatings", "Storm Claims"],
    badgeLocation: "Fort Worth, TX",
  },
  reviews: {
    heading: "Trusted by North Texas facility managers,",
    headingEmphasis: "in their own words.",
    ratingScore: "4.9",
    ratingSummary: "Average of 240 Google & BBB Reviews",
    items: [
      {
        quote: "They reroofed our 120,000 sq ft logistics depot in 4 days with zero interruption to logistics.",
        author: "David R.",
        roleOrLocation: "Logistics Director, Fort Worth",
      },
      {
        quote: "Handled our hail claim end-to-end. The drone reports made adjuster approval seamless.",
        author: "Sarah M.",
        roleOrLocation: "Property Manager, Arlington",
      },
      {
        quote: "Clean, professional, punctual. Best commercial contractors we have worked with.",
        author: "Greg K.",
        roleOrLocation: "Operations VP, Dallas",
      },
    ],
  },
  location: {
    headingArea: "Airport Freeway",
    headingCity: "Fort Worth",
    morningHours: "6:30 am – 6:00 pm",
    eveningHours: "24/7 Emergency Dispatch",
    mapQuery: "4200 Airport Fwy, Fort Worth, TX 76117",
  },
  footer: {
    hollowWord: "Apex",
    hollowWordEmphasis: "Roofing",
    summary: "Commercial roofing and storm restoration authority serving Tarrant and Dallas Counties.",
  },
};

const dentalMock: PreviewSiteData = {
  businessName: "Luxe Smile Studio",
  tagline: "Cosmetic & Restorative Dentistry",
  niche: "Cosmetic Dentistry",
  city: "Beverly Hills",
  area: "Rodeo Drive",
  phone: "(310) 555-0188",
  whatsappNumber: "13105550188",
  fullAddress: "9684 Wilshire Blvd, Beverly Hills, CA 90212",
  themeId: "luxury-obsidian",
  fontPairingId: "editorial-newsreader",
  hero: {
    h1Line1: "Bespoke",
    h1Line2: "smiles, crafted",
    h1Line3Emphasis: "artfully.",
    subheadline:
      "Handcrafted porcelain veneers, minimally invasive restorative care, and discreet aligner therapy in Beverly Hills.",
    primaryCtaText: "Reserve Consultation",
    secondaryCtaText: "View Smile Gallery",
  },
  philosophy: {
    statementHtml:
      "Every smile transformation begins with <em>facial harmony analysis.</em> You preview <b>3D digital mockups</b> before touching a tooth, discuss <em>every shade nuance</em>, and approve <b>your custom design</b> with complete confidence.",
    ctaText: "Meet Dr. Laurent",
  },
  principles: {
    heading: "The four distinctions our patients",
    headingEmphasis: "cherish most",
    lede: "In luxury cosmetic dentistry, subtle artistry and absolute comfort define our practice.",
    pillars: [
      {
        title: "Microscope-Guided Precision",
        description: "Preserves 90% more natural enamel through ultra-conservative preparations.",
      },
      {
        title: "Bespoke Ceramic Artistry",
        description: "Hand-layered feldspathic porcelain crafted individually by master master ceramists.",
      },
      {
        title: "Private Suite Appointments",
        description: "Exclusive single-patient scheduling with zero waiting and discreet executive service.",
      },
      {
        title: "Sedation & Pain-Free Comfort",
        description: "Gentle aesthetic anesthesia protocols designed for total relaxation.",
      },
    ],
  },
  servicesSection: {
    heading: "Comprehensive aesthetic excellence,",
    headingEmphasis: "under one roof.",
    items: [
      {
        title: "Porcelain Veneers",
        description: "Ultra-thin custom ceramics designed for natural translucency and luminescence.",
      },
      {
        title: "Full Smile Reconstruction",
        description: "Harmonizing bite function and jaw kinematics with pristine aesthetic balance.",
      },
      {
        title: "Invisalign First Class",
        description: "Accelerated clear aligners for refined alignment without traditional braces.",
      },
      {
        title: "Laser Gum Contouring",
        description: "Painless sculpting to create ideal symmetrical proportions for your smile.",
      },
      {
        title: "Internal Tooth Whitening",
        description: "Deep intrinsic stain removal for radiant enamel brightness.",
      },
      {
        title: "Biomimetic Inlays & Onlays",
        description: "Gold-standard restorations that replicate the natural flexibility of teeth.",
      },
    ],
  },
  process: {
    heading: "Your aesthetic journey,",
    headingEmphasis: "step by step.",
    lede: "A private, luxurious pathway from 3D visual preview to permanent perfection.",
    steps: [
      { stepNumber: 1, title: "Aesthetic Consultation", description: "Facial analysis and photograph mapping." },
      { stepNumber: 2, title: "3D Trial Smile", description: "Wear a preview mockup directly on your teeth." },
      { stepNumber: 3, title: "Artisan Crafting", description: "Individual hand-layering in our master lab." },
      { stepNumber: 4, title: "Final Placement", description: "Microscope bonding and occlusal calibration." },
      { stepNumber: 5, title: "Luxury Maintenance", description: "Bespoke aftercare and annual protection." },
    ],
  },
  founder: {
    name: "Dr. Julian Laurent",
    nameEmphasis: "D.D.S. F.A.A.C.D.",
    titleOrCredentials: "Aesthetic Specialist & Fellow AACD",
    yearsExperience: "14+",
    reviewCount: "185",
    ratingScore: "5.0",
    bio: "Dr. Laurent trained in Zurich and Los Angeles, pioneering biomimetic veneer procedures that protect tooth structure while delivering world-class smiles.",
    expertiseAreas: ["Minimal-Prep Veneers", "Full Smile Rejuvenation", "Occlusal Design"],
    badgeLocation: "Beverly Hills, CA",
  },
  reviews: {
    heading: "Praised by discerning patients,",
    headingEmphasis: "in their own words.",
    ratingScore: "5.0",
    ratingSummary: "Perfect 5.0 Rating from 185 Client Reviews",
    items: [
      {
        quote: "Dr. Laurent gave me the most natural, stunning veneers imaginable. People think I was born with them.",
        author: "Elena V.",
        roleOrLocation: "Beverly Hills Resident",
      },
      {
        quote: "The private suite experience is unparalleled. Punctual, painless, and artistically brilliant.",
        author: "Harrison T.",
        roleOrLocation: "Film Producer, Los Angeles",
      },
      {
        quote: "I flew in from London for my smile makeover and it was worth every single mile.",
        author: "Camilla P.",
        roleOrLocation: "London, UK",
      },
    ],
  },
  location: {
    headingArea: "Wilshire Boulevard",
    headingCity: "Beverly Hills",
    morningHours: "9:00 am – 1:00 pm",
    eveningHours: "2:00 pm – 6:00 pm (Private By Appt)",
    mapQuery: "9684 Wilshire Blvd, Beverly Hills, CA 90212",
  },
  footer: {
    hollowWord: "Luxe",
    hollowWordEmphasis: "Studio",
    summary: "Exclusive cosmetic dentistry on Wilshire Boulevard, serving Beverly Hills and worldwide clientele.",
  },
};

async function runTests() {
  console.log("=================================================");
  console.log("PHASE 1 GATE TEST 1.2: 100% MOBILE & MULTI-FONT");
  console.log("=================================================\n");

  const outDir = path.join(process.cwd(), "public", "test-previews");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  // 1. Render Roofing
  console.log("Rendering 1: Apex Commercial Roofing (Industrial Slate + Bold Syne)...");
  const roofingHtml = renderPreviewHtml(roofingMock);
  const roofingPath = path.join(outDir, "test-roofing-mobile.html");
  fs.writeFileSync(roofingPath, roofingHtml, "utf-8");

  // 2. Render Dental
  console.log("Rendering 2: Luxe Smile Studio (Luxury Obsidian + Editorial Newsreader)...");
  const dentalHtml = renderPreviewHtml(dentalMock);
  const dentalPath = path.join(outDir, "test-dental-mobile.html");
  fs.writeFileSync(dentalPath, dentalHtml, "utf-8");

  // 3. Verification Assertions
  const checks = [
    {
      name: "Roofing HTML length check (> 30,000 chars)",
      pass: roofingHtml.length > 30000,
      actual: `${roofingHtml.length} chars`,
    },
    {
      name: "Dental HTML length check (> 30,000 chars)",
      pass: dentalHtml.length > 30000,
      actual: `${dentalHtml.length} chars`,
    },
    {
      name: "Floating Mobile Bottom Dock (.callbar) present in Roofing",
      pass: roofingHtml.includes('class="callbar"') && roofingHtml.includes('id="callbar"'),
    },
    {
      name: "Floating Mobile Bottom Dock (.callbar) present in Dental",
      pass: dentalHtml.includes('class="callbar"') && dentalHtml.includes('id="callbar"'),
    },
    {
      name: "Mobile swipe rail dots logic present",
      pass: roofingHtml.includes("updateDots()") && roofingHtml.includes(".dots"),
    },
    {
      name: "Mobile tactile sheet cards (#ECEFEF) present in CSS",
      pass: roofingHtml.includes("background:#ECEFEF") && dentalHtml.includes("background:#ECEFEF"),
    },
    {
      name: "Bold Industrial Typography injected for Roofing (Syne + DM Sans)",
      pass: roofingHtml.includes("family=Syne") && roofingHtml.includes("family=DM+Sans"),
    },
    {
      name: "Editorial Typography injected for Dental (Newsreader + Schibsted)",
      pass: dentalHtml.includes("family=Newsreader") && dentalHtml.includes("family=Schibsted+Grotesk"),
    },
    {
      name: "Pinsite Agency Bar present on desktop/mobile",
      pass: roofingHtml.includes("pinsite-bar") && dentalHtml.includes("pinsite-bar"),
    },
    {
      name: "Zero hardcoded 'Joshi' or 'Kothrud' leftovers",
      pass:
        !roofingHtml.includes("Joshi") &&
        !dentalHtml.includes("Joshi") &&
        !roofingHtml.includes("Kothrud") &&
        !dentalHtml.includes("Kothrud"),
    },
  ];

  let failed = 0;
  for (const c of checks) {
    if (c.pass) {
      console.log(`  ✅ PASS: ${c.name} ${c.actual ? `(${c.actual})` : ""}`);
    } else {
      console.error(`  ❌ FAIL: ${c.name}`);
      failed++;
    }
  }

  console.log("\n=================================================");
  if (failed === 0) {
    console.log("🎉 ALL PHASE 1 GATE TESTS (MOBILE & FONTS) PASSED 100%!");
    console.log(`Saved output 1: ${roofingPath}`);
    console.log(`Saved output 2: ${dentalPath}`);
    console.log("=================================================");
    process.exit(0);
  } else {
    console.error(`💥 ${failed} TEST(S) FAILED!`);
    console.log("=================================================");
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});
