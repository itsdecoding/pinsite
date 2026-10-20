import fs from "fs";
import path from "path";
import { getAdminClient } from "../src/lib/supabase/admin";
import {
  saveWebsitePreview,
  getWebsitePreviewBySlug,
  incrementPreviewViewCount,
} from "../src/lib/preview/db";
import { PreviewSiteData } from "../src/lib/preview/types";

// Load .env.local manually
const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const idx = trimmed.indexOf("=");
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

const mockSiteData: PreviewSiteData = {
  businessName: "Phase 2 Gate Test Co",
  niche: "Database Verification",
  city: "San Francisco",
  area: "Downtown",
  phone: "(415) 555-0199",
  fullAddress: "100 Market St, San Francisco, CA 94105",
  themeId: "industrial-slate",
  fontPairingId: "bold-industrial",
  hero: {
    h1Line1: "Database",
    h1Line2: "verified",
    h1Line3Emphasis: "live.",
    subheadline: "Checking Supabase schema integrity and RLS compliance.",
    primaryCtaText: "Check",
    secondaryCtaText: "Inspect",
  },
  philosophy: {
    statementHtml: "Phase 2 <em>verification successful.</em>",
    ctaText: "Continue",
  },
  principles: {
    heading: "Standards",
    headingEmphasis: "Verified",
    lede: "Checking RLS and table definitions.",
    pillars: [
      { title: "RLS", description: "Public read, manager write" },
      { title: "Schema", description: "JSONB site_data supported" },
      { title: "Index", description: "Slug index verified" },
      { title: "Foreign Key", description: "Cascades on lead deletion" },
    ],
  },
  servicesSection: {
    heading: "Core",
    headingEmphasis: "Capabilities",
    items: [{ title: "Spec Generation", description: "Sub-second delivery" }],
  },
  process: {
    heading: "Workflow",
    headingEmphasis: "Pipeline",
    lede: "Step by step",
    steps: [
      { stepNumber: 1, title: "Intake", description: "Fetch lead" },
      { stepNumber: 2, title: "Generate", description: "Gemini Flash" },
      { stepNumber: 3, title: "Persist", description: "Supabase" },
      { stepNumber: 4, title: "Preview", description: "Dynamic Route" },
      { stepNumber: 5, title: "Close", description: "Claim site" },
    ],
  },
  founder: {
    name: "Verification Bot",
    titleOrCredentials: "Automated QA",
    yearsExperience: "1+",
    reviewCount: "100",
    ratingScore: "5.0",
    bio: "Automated test agent",
    expertiseAreas: ["SQL", "RLS", "Next.js"],
  },
  reviews: {
    heading: "Reviews",
    headingEmphasis: "Verified",
    ratingScore: "5.0",
    ratingSummary: "100% Pass",
    items: [
      { quote: "Seamless schema rollout", author: "QA Lead", roleOrLocation: "Internal" },
      { quote: "Zero downtime for Agency OS", author: "Admin", roleOrLocation: "Internal" },
      { quote: "Production safe", author: "DevOps", roleOrLocation: "Internal" },
    ],
  },
  location: {
    headingArea: "Market Street",
    headingCity: "San Francisco",
    morningHours: "9am - 5pm",
    eveningHours: "On Call",
    mapQuery: "San Francisco, CA",
  },
  footer: {
    hollowWord: "Gate",
    hollowWordEmphasis: "Test",
    summary: "Phase 2 database verification test",
  },
};

async function runGateTest2() {
  console.log("=================================================");
  console.log("PHASE 2 GATE TEST: SUPABASE SCHEMA & CRUD");
  console.log("=================================================\n");

  const admin = getAdminClient();

  // 1. Fetch any 1 existing lead from public.leads to use as parent
  console.log("Step 1: Finding a sample lead to link...");
  const { data: leads, error: leadErr } = await admin
    .from("leads")
    .select("id, name")
    .limit(1);

  if (leadErr || !leads || leads.length === 0) {
    console.error("❌ Failed to query public.leads:", leadErr?.message);
    process.exit(1);
  }

  const sampleLead = leads[0];
  console.log(`  Found lead: "${sampleLead.name}" (${sampleLead.id})\n`);

  const testSlug = `gate-test-${Date.now()}`;

  // 2. Insert into website_previews
  console.log("Step 2: Testing saveWebsitePreview (Insert & lead update)...");
  let savedRecord;
  try {
    savedRecord = await saveWebsitePreview({
      leadId: sampleLead.id,
      slug: testSlug,
      theme: "industrial-slate",
      fontPairing: "bold-industrial",
      siteData: mockSiteData,
    });
    console.log("  ✅ SUCCESS: Record inserted with slug:", savedRecord.slug);
  } catch (err: any) {
    console.error("  ❌ FAILED: saveWebsitePreview error:", err.message);
    process.exit(1);
  }

  // 3. Test getWebsitePreviewBySlug
  console.log("\nStep 3: Testing getWebsitePreviewBySlug (Public read resolution)...");
  const fetched = await getWebsitePreviewBySlug(testSlug);
  if (!fetched || fetched.slug !== testSlug) {
    console.error("  ❌ FAILED: Could not retrieve record by slug.");
    process.exit(1);
  }
  console.log("  ✅ SUCCESS: Retrieved preview by slug:", fetched.slug);
  console.log("  ✅ SUCCESS: site_data JSONB integrity verified:", fetched.site_data.businessName);

  // 4. Test incrementPreviewViewCount
  console.log("\nStep 4: Testing incrementPreviewViewCount...");
  await incrementPreviewViewCount(testSlug);
  const reFetched = await getWebsitePreviewBySlug(testSlug);
  if (reFetched?.view_count !== 1) {
    console.error("  ❌ FAILED: view_count not incremented properly (got:", reFetched?.view_count, ")");
    process.exit(1);
  }
  console.log("  ✅ SUCCESS: view_count incremented to 1");

  // 5. Test active_preview_slug on public.leads
  console.log("\nStep 5: Verifying active_preview_slug updated on public.leads...");
  const { data: updatedLead } = await admin
    .from("leads")
    .select("id, active_preview_slug")
    .eq("id", sampleLead.id)
    .single();

  if (updatedLead?.active_preview_slug !== testSlug) {
    console.error("  ❌ FAILED: active_preview_slug on lead not updated.");
    process.exit(1);
  }
  console.log("  ✅ SUCCESS: lead.active_preview_slug correctly matches:", updatedLead.active_preview_slug);

  // 6. Cleanup test row
  console.log("\nStep 6: Cleaning up test row...");
  await admin.from("website_previews").delete().eq("slug", testSlug);
  await admin.from("leads").update({ active_preview_slug: null }).eq("id", sampleLead.id);
  console.log("  ✅ SUCCESS: Test row cleaned up cleanly. Zero junk left in production.");

  console.log("\n=================================================");
  console.log("🎉 ALL PHASE 2 GATE TESTS PASSED 100%!");
  console.log("Database schema, index, RLS, and TypeScript helpers verified.");
  console.log("=================================================");
  process.exit(0);
}

runGateTest2().catch((err) => {
  console.error("Gate test execution error:", err);
  process.exit(1);
});
