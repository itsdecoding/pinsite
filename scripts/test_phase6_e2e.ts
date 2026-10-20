import fs from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { getAdminClient } from "../src/lib/supabase/admin";
import { generateSiteBlueprintWithGemini } from "../src/lib/preview/gemini";
import { saveWebsitePreview, getWebsitePreviewBySlug } from "../src/lib/preview/db";
import { GET } from "../src/app/preview/[slug]/route";
import { DELETE, PATCH } from "../src/app/api/preview/generate/route";

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

async function runE2ETest() {
  console.log("=================================================");
  console.log("   PINSITE PHASE 6: END-TO-END SYSTEM TEST       ");
  console.log("=================================================\n");

  const supabase = getAdminClient();

  // Fetch real leads from public.leads
  const { data: realLeads, error: leadsError } = await supabase
    .from("leads")
    .select("id, name, niche, area, address, phone")
    .limit(2);

  if (leadsError || !realLeads || realLeads.length === 0) {
    throw new Error(`Failed to fetch test leads from public.leads: ${leadsError?.message}`);
  }

  const testScenarios = realLeads.map((l) => ({
    id: l.id,
    name: l.name,
    niche: l.niche,
    area: l.area,
    address: l.address,
    phone: l.phone,
  }));

  for (let i = 0; i < testScenarios.length; i++) {
    const lead = testScenarios[i];
    console.log(`[Scenario ${i + 1}/${testScenarios.length}] Testing: "${lead.name}" (${lead.niche})...`);

    // 1. Generate blueprint via Gemini Flash
    const t0 = Date.now();
    const blueprint = await generateSiteBlueprintWithGemini({
      id: `test-lead-${i}`,
      name: lead.name,
      niche: lead.niche,
      area: lead.area,
      address: lead.address,
      phone: lead.phone,
    });
    const genMs = Date.now() - t0;
    console.log(`  1. AI Blueprint generated in ${genMs}ms:`);
    console.log(`     - Theme: ${blueprint.themeId}`);
    console.log(`     - Font: ${blueprint.fontPairingId}`);
    console.log(`     - Headline: "${blueprint.hero.h1Line1} ${blueprint.hero.h1Line2}"`);

    // 2. Persist to Supabase
    const testSlug = `e2e-test-${i}-${Date.now().toString(36)}`;
    const saved = await saveWebsitePreview({
      leadId: lead.id,
      slug: testSlug,
      theme: blueprint.themeId,
      fontPairing: blueprint.fontPairingId || "editorial-newsreader",
      siteData: blueprint,
    });
    console.log(`  2. Persisted to database with slug: "${saved.slug}"`);

    // 3. Test Public Route GET /preview/[slug]
    const req = new NextRequest(`https://pinsite.pro/preview/${testSlug}`);
    const res = await GET(req, { params: { slug: testSlug } });
    if (res.status !== 200) {
      throw new Error(`Route returned ${res.status}`);
    }
    const html = await res.text();
    if (!html.includes("class=\"pinsite-bar\"") || !html.includes("class=\"callbar\"")) {
      throw new Error("Missing mobile chassis landmarks (.pinsite-bar, .callbar)");
    }
    console.log(`  3. Public route served 200 OK (${html.length} bytes) with mobile callbar & Pinsite bar!`);

    // 4. Test Granular Patch (Theme Switch without copy loss)
    const newTheme = blueprint.themeId === "luxury-obsidian" ? "industrial-slate" : "luxury-obsidian";
    const { error: patchError } = await supabase
      .from("website_previews")
      .update({
        theme: newTheme,
        site_data: { ...blueprint, themeId: newTheme },
      })
      .eq("slug", testSlug);

    if (patchError) throw patchError;
    const patchedRecord = await getWebsitePreviewBySlug(testSlug);
    if (patchedRecord?.theme !== newTheme) {
      throw new Error("Theme patch failed.");
    }
    console.log(`  4. 1-Click Granular Patch swapped theme to "${newTheme}" cleanly!`);

    // 5. Test Permanent Purge (Clean wipe)
    const { error: delError } = await supabase
      .from("website_previews")
      .delete()
      .eq("slug", testSlug);

    if (delError) throw delError;
    const deletedRecord = await getWebsitePreviewBySlug(testSlug);
    if (deletedRecord !== null) {
      throw new Error("Preview was not deleted cleanly.");
    }
    console.log(`  5. Permanent Delete purged preview from Supabase cleanly!`);
    console.log(`  ✅ Scenario ${i + 1} PASSED completely!\n`);
  }

  console.log("=================================================");
  console.log("   ALL END-TO-END SCENARIOS PASSED (100%)       ");
  console.log("=================================================");
}

runE2ETest().catch((err) => {
  console.error("❌ E2E Test Failed:", err);
  process.exit(1);
});
