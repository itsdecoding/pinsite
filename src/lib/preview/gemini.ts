import { LeadIntakeData } from "./intake";
import { PreviewSiteData, ThemeId, FontPairingId } from "./types";

function getGeminiApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error("Missing GEMINI_API_KEY in environment variables (.env.local)");
  }
  return key;
}

export async function generateSiteBlueprintWithGemini(
  lead: LeadIntakeData
): Promise<PreviewSiteData> {
  const apiKey = getGeminiApiKey();
  const candidateModels = [
    "gemini-3.5-flash",
    "gemini-3-flash-preview",
    "gemini-3.8-flash",
    "gemini-2.5-pro",
  ];

  const systemInstruction = `
You are the Creative Director and Master Copywriter at Pinsite, an elite boutique web design agency.
Your job is to generate a luxury, high-converting website blueprint for a real prospect in strict JSON format.

RULES FOR UNMATCHED COPYWRITING:
1. BAN GENERIC FLUFF: NEVER write phrases like "Welcome to our website", "We are the premier choice", "Quality you can trust", "Best service in town".
2. HYPER-LOCALIZED & AUTHENTIC: Use the exact city, area, state, and regional context (e.g. climate challenges, local landmarks, neighborhood references).
3. INDUSTRY SPECIFICITY: Mention real techniques, materials, terminology, and realistic procedures (e.g. for roofing: "TPO single-ply", "silicone restoration", "Class 4 hail shingles"; for dentistry: "biomimetic veneers", "microscope-guided precision").
4. AESTHETIC SELECTION:
   - Pick themeId strictly from: "industrial-slate" (trades/roofing/hvac/plumbing), "medical-mint" (dental/medical/therapy), "luxury-obsidian" (legal/real estate/wealth/cosmetic), "electric-azure" (auto detailing/tech), "warm-terracotta" (boutiques/salons/food).
   - Pick fontPairingId strictly from: "bold-industrial", "editorial-newsreader", "tech-grotesk", "modern-clean".
5. OUTPUT FORMAT: Return ONLY valid raw JSON with NO markdown backticks or commentary.
`;

  const prompt = `
Generate a complete website preview blueprint for this business:
- Business Name: "${lead.name}"
- Industry / Niche: "${lead.niche}"
- Area: "${lead.area}"
- Address / City: "${lead.address}"
- Phone: "${lead.phone}"
- Website: "${lead.website || "None"}"

Return JSON matching this exact structure:
{
  "businessName": "${lead.name}",
  "tagline": "A punchy 3-5 word high-impact tagline",
  "niche": "${lead.niche}",
  "city": "Extracted city name",
  "area": "${lead.area}",
  "phone": "${lead.phone}",
  "whatsappNumber": "${lead.phone.replace(/[^0-9]/g, "")}",
  "fullAddress": "${lead.address}",
  "themeId": "industrial-slate" | "medical-mint" | "luxury-obsidian" | "electric-azure" | "warm-terracotta",
  "fontPairingId": "bold-industrial" | "editorial-newsreader" | "tech-grotesk" | "modern-clean",
  "hero": {
    "h1Line1": "Short word or two",
    "h1Line2": "Short word or two",
    "h1Line3Emphasis": "Single punchy closing word (will be italicized)",
    "subheadline": "Compelling 2-sentence value proposition specific to their exact service and city.",
    "primaryCtaText": "e.g. Schedule Consultation / Book Free Inspection",
    "secondaryCtaText": "e.g. View Portfolio / See Treatments"
  },
  "philosophy": {
    "statementHtml": "A striking 2-sentence diagnosis/philosophy statement with <em>italic phrases</em> and <b>bold words</b> for visual rhythm.",
    "ctaText": "e.g. Meet Our Lead Specialist"
  },
  "principles": {
    "heading": "Four standards clients",
    "headingEmphasis": "notice first",
    "lede": "Specific reason why clients choose them over competitors.",
    "pillars": [
      { "title": "Pillar 1", "description": "Specific technical commitment" },
      { "title": "Pillar 2", "description": "Specific technical commitment" },
      { "title": "Pillar 3", "description": "Specific technical commitment" },
      { "title": "Pillar 4", "description": "Specific technical commitment" }
    ]
  },
  "servicesSection": {
    "heading": "Comprehensive services,",
    "headingEmphasis": "engineered for results.",
    "items": [
      { "title": "Service 1", "description": "Detailed real-world description" },
      { "title": "Service 2", "description": "Detailed real-world description" },
      { "title": "Service 3", "description": "Detailed real-world description" },
      { "title": "Service 4", "description": "Detailed real-world description" },
      { "title": "Service 5", "description": "Detailed real-world description" },
      { "title": "Service 6", "description": "Detailed real-world description" }
    ]
  },
  "process": {
    "heading": "Your project pathway,",
    "headingEmphasis": "step by step.",
    "lede": "Clear 5-step operational milestone process.",
    "steps": [
      { "stepNumber": 1, "title": "Step 1", "description": "Short description" },
      { "stepNumber": 2, "title": "Step 2", "description": "Short description" },
      { "stepNumber": 3, "title": "Step 3", "description": "Short description" },
      { "stepNumber": 4, "title": "Step 4", "description": "Short description" },
      { "stepNumber": 5, "title": "Step 5", "description": "Short description" }
    ]
  },
  "founder": {
    "name": "Realistic Founder/Director Name",
    "nameEmphasis": "Professional Title / Credentials",
    "titleOrCredentials": "e.g. Licensed Master Contractor / B.D.S. Specialist",
    "yearsExperience": "15+",
    "reviewCount": "190+",
    "ratingScore": "4.9",
    "bio": "Compelling 2-sentence background story highlighting hands-on commitment.",
    "expertiseAreas": ["Specialty A", "Specialty B", "Specialty C"],
    "badgeLocation": "${lead.area}"
  },
  "reviews": {
    "heading": "Praised by local clients,",
    "headingEmphasis": "in their own words.",
    "ratingScore": "4.9",
    "ratingSummary": "Verified Google & Client Reviews",
    "items": [
      { "quote": "Authentic sounding high-converting quote", "author": "First L.", "roleOrLocation": "Local Neighborhood" },
      { "quote": "Authentic sounding high-converting quote", "author": "First L.", "roleOrLocation": "Local Neighborhood" },
      { "quote": "Authentic sounding high-converting quote", "author": "First L.", "roleOrLocation": "Local Neighborhood" }
    ]
  },
  "location": {
    "headingArea": "${lead.area}",
    "headingCity": "City Name",
    "morningHours": "8:00 am – 5:00 pm",
    "eveningHours": "By Appointment / 24h Support",
    "mapQuery": "${lead.address}"
  },
  "footer": {
    "hollowWord": "One word from brand",
    "hollowWordEmphasis": "Second word",
    "summary": "Crisp 1-sentence brand summary."
  }
}
`;

  const requestBody = {
    contents: [
      {
        parts: [{ text: `${systemInstruction}\n\n${prompt}` }],
      },
    ],
    generationConfig: {
      response_mime_type: "application/json",
      temperature: 0.6,
      max_output_tokens: 4096,
    },
  };

  const startTime = Date.now();
  let res: Response | null = null;
  let lastErrorText = "";

  for (const model of candidateModels) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(30000),
      });

      if (res.ok) {
        break;
      }

      lastErrorText = await res.text();
      console.warn(`Gemini model ${model} returned ${res.status}: ${lastErrorText.slice(0, 100)}. Trying next model...`);
    } catch (err: any) {
      console.warn(`Gemini model ${model} failed (${err.message}). Trying next model...`);
    }
  }

  if (!res || !res.ok) {
    throw new Error(`All Gemini candidate models failed. Last error: ${lastErrorText}`);
  }

  const json = await res.json();
  const rawText = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    throw new Error("Gemini returned empty candidate response.");
  }

  let parsed: PreviewSiteData;
  try {
    parsed = JSON.parse(rawText.trim());
  } catch (err: any) {
    throw new Error(`Failed to parse Gemini JSON response: ${err.message}. Raw: ${rawText}`);
  }

  // Ensure mandatory fields exist
  parsed.businessName = parsed.businessName || lead.name;
  parsed.phone = parsed.phone || lead.phone;
  parsed.fullAddress = parsed.fullAddress || lead.address;
  parsed.niche = parsed.niche || lead.niche;

  return parsed;
}
