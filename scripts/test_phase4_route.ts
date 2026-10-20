import fs from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { GET } from "../src/app/preview/[slug]/route";
import { getAdminClient } from "../src/lib/supabase/admin";
import { getLeadForPreview } from "../src/lib/preview/intake";
import { generateSiteBlueprintWithGemini } from "../src/lib/preview/gemini";
import { saveWebsitePreview } from "../src/lib/preview/db";

// Manually load .env.local
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

async function runTest() {
  console.log("=================================================");
  console.log("   PINSITE GATE TEST 4.1: DYNAMIC PUBLIC ROUTE   ");
  console.log("=================================================");

  const supabase = getAdminClient();

  // 1. Find or create an existing preview record in website_previews
  console.log("\n[Step 1] Checking existing preview records in database...");
  let { data: previews } = await supabase
    .from("website_previews")
    .select("slug, site_data, view_count")
    .order("created_at", { ascending: false })
    .limit(1);

  let testPreview = previews && previews.length > 0 ? previews[0] : null;

  if (!testPreview) {
    console.log("  No existing preview found. Creating fresh preview for real lead...");
    const { data: leads } = await supabase.from("leads").select("id").limit(1);
    if (!leads || leads.length === 0) {
      throw new Error("No leads found in public.leads to test with.");
    }
    const lead = await getLeadForPreview(leads[0].id);
    console.log(`  Generating blueprint with Gemini for "${lead.name}"...`);
    const blueprint = await generateSiteBlueprintWithGemini(lead);
    const testSlug = `phase4-demo-${Date.now().toString(36)}`;
    const saved = await saveWebsitePreview({
      leadId: lead.id,
      slug: testSlug,
      theme: blueprint.themeId,
      fontPairing: blueprint.fontPairingId || "editorial-newsreader",
      siteData: blueprint,
    });
    testPreview = {
      slug: saved.slug,
      site_data: saved.site_data,
      view_count: saved.view_count,
    };
    console.log(`  Created test preview: "${testPreview.slug}"`);
  }

  const businessName = testPreview.site_data.businessName;
  console.log(`\nTesting preview slug: "${testPreview.slug}" for "${businessName}"`);
  console.log(`Initial view_count: ${testPreview.view_count}`);

  // 2. Test GET on existing slug
  console.log("\n[Step 2] Executing GET on valid slug...");
  const startTime = Date.now();
  const req = new NextRequest(`https://pinsite.pro/preview/${testPreview.slug}`);
  const res = await GET(req, { params: { slug: testPreview.slug } });
  const duration = Date.now() - startTime;

  console.log(`Response status: ${res.status}`);
  console.log(`Response time: ${duration}ms (target: < 500ms)`);
  console.log(`Content-Type: ${res.headers.get("content-type")}`);
  console.log(`Cache-Control: ${res.headers.get("cache-control")}`);

  if (res.status !== 200) {
    throw new Error(`Expected 200 OK, got ${res.status}`);
  }

  const html = await res.text();
  console.log(`HTML length: ${html.length} bytes`);

  // Verify key components in compiled HTML
  if (!html.includes(businessName)) {
    throw new Error(`Business name "${businessName}" missing from compiled HTML.`);
  }
  if (!html.includes("class=\"pinsite-bar\"")) {
    throw new Error("Pinsite Agency wrapper bar (.pinsite-bar) missing from HTML.");
  }
  if (!html.includes("class=\"callbar\"")) {
    throw new Error("Mobile bottom dock (.callbar) missing from HTML.");
  }
  const expectedClaimSnippet = encodeURIComponent("Hi Pinsite, I reviewed the preview for");
  if (!html.includes(expectedClaimSnippet)) {
    throw new Error("WhatsApp claim prefilled message missing from HTML.");
  }
  console.log("✅ All required HTML landmarks (.pinsite-bar, .callbar, claim link, business name) verified!");

  // Wait a moment for fire-and-forget view count increment
  console.log("\n[Step 3] Verifying asynchronous view count increment...");
  await new Promise((r) => setTimeout(r, 600));

  const { data: updatedRecord } = await supabase
    .from("website_previews")
    .select("view_count")
    .eq("slug", testPreview.slug)
    .single();

  console.log(`Updated view_count: ${updatedRecord?.view_count}`);
  if (!updatedRecord || updatedRecord.view_count <= testPreview.view_count) {
    console.warn("⚠️ View count did not increment immediately.");
  } else {
    console.log("✅ View count incremented successfully in the background!");
  }

  // 4. Test 404 on invalid slug
  console.log("\n[Step 4] Executing GET on invalid/non-existent slug...");
  const invalidReq = new NextRequest("https://pinsite.pro/preview/non-existent-clinic-xyz-999");
  const notFoundRes = await GET(invalidReq, { params: { slug: "non-existent-clinic-xyz-999" } });

  console.log(`Response status: ${notFoundRes.status}`);
  if (notFoundRes.status !== 404) {
    throw new Error(`Expected 404 for invalid slug, got ${notFoundRes.status}`);
  }
  const notFoundHtml = await notFoundRes.text();
  if (!notFoundHtml.includes("Concept Preview Not Found")) {
    throw new Error("Pinsite branded 404 message missing from 404 page.");
  }
  console.log("✅ 404 response served with Pinsite branded error page!");

  console.log("\n=================================================");
  console.log("   GATE TEST 4.1: PASSED (100% SUCCESS)         ");
  console.log("=================================================");
}

runTest().catch((err) => {
  console.error("❌ Gate Test 4.1 Failed:", err);
  process.exit(1);
});
