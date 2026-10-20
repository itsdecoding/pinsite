import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, verifyManagerSession } from "@/lib/supabase/admin";
import { getLeadForPreview } from "@/lib/preview/intake";
import { generateSiteBlueprintWithGemini } from "@/lib/preview/gemini";
import { saveWebsitePreview, getWebsitePreviewBySlug } from "@/lib/preview/db";
import { PreviewSiteData, ThemeId, FontPairingId } from "@/lib/preview/types";
import { generateUniqueVanitySlug } from "@/lib/preview/slug";

export const dynamic = "force-dynamic";

/**
 * POST /api/preview/generate
 * Automatically generates a luxury website preview from lead metadata.
 * Restricted to Manager and Admin roles only.
 */
export async function POST(req: NextRequest) {
  try {
    const authResult = await verifyManagerSession(req);
    if ("error" in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const body = await req.json();
    const { leadId } = body;

    if (!leadId) {
      return NextResponse.json({ error: "Missing required parameter: leadId" }, { status: 400 });
    }

    const startTime = Date.now();

    // 1. Automatic Lead Intake from Supabase
    const lead = await getLeadForPreview(leadId);

    // 2. Gemini Flash AI Orchestration
    const siteBlueprint = await generateSiteBlueprintWithGemini(lead);

    // 3. Generate clean, un-spammed executive vanity slug (e.g. "perfect-smile")
    const slug = await generateUniqueVanitySlug(lead.name, lead.area);

    // 4. Save to Supabase website_previews and link to lead
    const saved = await saveWebsitePreview({
      leadId: lead.id,
      slug,
      theme: siteBlueprint.themeId,
      fontPairing: siteBlueprint.fontPairingId || "editorial-newsreader",
      siteData: siteBlueprint,
      createdBy: authResult.user.id,
    });

    const durationMs = Date.now() - startTime;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://pinsite.pro";
    const previewUrl = `${appUrl}/${slug}`;

    return NextResponse.json({
      success: true,
      slug: saved.slug,
      previewUrl,
      theme: saved.theme,
      fontPairing: saved.font_pairing,
      siteData: saved.site_data,
      durationMs,
    });
  } catch (error: any) {
    console.error("Preview generation error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate website preview" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/preview/generate
 * Granularly tweaks an existing preview (1-click theme swap, font swap, or text edits)
 * without re-rolling the rest of the site.
 */
export async function PATCH(req: NextRequest) {
  try {
    const authResult = await verifyManagerSession(req);
    if ("error" in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const body = await req.json();
    const { slug, theme, fontPairing, siteDataUpdates } = body;

    if (!slug) {
      return NextResponse.json({ error: "Missing required parameter: slug" }, { status: 400 });
    }

    const existing = await getWebsitePreviewBySlug(slug);
    if (!existing) {
      return NextResponse.json({ error: `Preview with slug "${slug}" not found` }, { status: 404 });
    }

    // Merge updates
    const updatedTheme: ThemeId = (theme as ThemeId) || (existing.theme as ThemeId);
    const updatedFont: FontPairingId =
      (fontPairing as FontPairingId) || (existing.font_pairing as FontPairingId);
    const updatedSiteData: PreviewSiteData = {
      ...existing.site_data,
      ...siteDataUpdates,
      themeId: updatedTheme,
      fontPairingId: updatedFont,
    };

    const admin = getAdminClient();
    const { data: updated, error } = await admin
      .from("website_previews")
      .update({
        theme: updatedTheme,
        font_pairing: updatedFont,
        site_data: updatedSiteData,
        updated_at: new Date().toISOString(),
      })
      .eq("slug", slug)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://pinsite.pro";

    return NextResponse.json({
      success: true,
      slug: updated.slug,
      previewUrl: `${appUrl}/${updated.slug}`,
      theme: updated.theme,
      fontPairing: updated.font_pairing,
      siteData: updated.site_data,
    });
  } catch (error: any) {
    console.error("Preview patch error:", error);
    return NextResponse.json({ error: error.message || "Failed to patch preview" }, { status: 500 });
  }
}

/**
 * DELETE /api/preview/generate?slug=xyz
 * Permanently purges a generated preview and clears the active preview link from the lead.
 */
export async function DELETE(req: NextRequest) {
  try {
    const authResult = await verifyManagerSession(req);
    if ("error" in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { searchParams } = new URL(req.url);
    let slug = searchParams.get("slug");

    if (!slug) {
      try {
        const body = await req.json();
        slug = body.slug;
      } catch {
        // searchParams only
      }
    }

    if (!slug) {
      return NextResponse.json({ error: "Missing required parameter: slug" }, { status: 400 });
    }

    const existing = await getWebsitePreviewBySlug(slug);
    if (!existing) {
      return NextResponse.json({ error: `Preview with slug "${slug}" not found` }, { status: 404 });
    }

    const admin = getAdminClient();

    // 1. Delete preview record
    await admin.from("website_previews").delete().eq("slug", slug);

    // 2. Clear lead's active preview slug if it points to this preview
    if (existing.lead_id) {
      await admin
        .from("leads")
        .update({ active_preview_slug: null })
        .eq("id", existing.lead_id)
        .eq("active_preview_slug", slug);
    }

    return NextResponse.json({
      success: true,
      deleted: true,
      slug,
      leadId: existing.lead_id,
    });
  } catch (error: any) {
    console.error("Preview deletion error:", error);
    return NextResponse.json({ error: error.message || "Failed to delete preview" }, { status: 500 });
  }
}
