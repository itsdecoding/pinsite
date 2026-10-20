import { getAdminClient } from "@/lib/supabase/admin";
import { PreviewSiteData } from "./types";

export interface WebsitePreviewRecord {
  id: string;
  lead_id: string;
  slug: string;
  theme: string;
  font_pairing: string;
  site_data: PreviewSiteData;
  created_by: string | null;
  view_count: number;
  last_viewed_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Saves a new website preview record in Supabase and links it to the lead.
 * Uses service role admin client.
 */
export async function saveWebsitePreview(params: {
  leadId: string;
  slug: string;
  theme: string;
  fontPairing: string;
  siteData: PreviewSiteData;
  createdBy?: string | null;
}): Promise<WebsitePreviewRecord> {
  const admin = getAdminClient();

  const { data, error } = await admin
    .from("website_previews")
    .upsert(
      {
        lead_id: params.leadId,
        slug: params.slug,
        theme: params.theme,
        font_pairing: params.fontPairing,
        site_data: params.siteData,
        created_by: params.createdBy || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "slug" }
    )
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to save website preview: ${error.message}`);
  }

  // Update lead's active preview slug for instant lookup in the dialer
  await admin
    .from("leads")
    .update({ active_preview_slug: params.slug })
    .eq("id", params.leadId);

  return data as WebsitePreviewRecord;
}

/**
 * Fetches a website preview by slug. Can be called publicly.
 */
export async function getWebsitePreviewBySlug(slug: string): Promise<WebsitePreviewRecord | null> {
  const admin = getAdminClient();

  const { data, error } = await admin
    .from("website_previews")
    .select("*")
    .eq("slug", slug)
    .single();

  if (error || !data) {
    return null;
  }

  return data as WebsitePreviewRecord;
}

/**
 * Increments view count and updates last_viewed_at timestamp.
 */
export async function incrementPreviewViewCount(slug: string): Promise<void> {
  const admin = getAdminClient();
  const now = new Date().toISOString();

  // Optimistic bump
  const { data } = await admin
    .from("website_previews")
    .select("view_count")
    .eq("slug", slug)
    .single();

  const newCount = (data?.view_count || 0) + 1;

  await admin
    .from("website_previews")
    .update({
      view_count: newCount,
      last_viewed_at: now,
    })
    .eq("slug", slug);
}
