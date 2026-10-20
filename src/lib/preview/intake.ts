import { getAdminClient } from "@/lib/supabase/admin";

export interface LeadIntakeData {
  id: string;
  name: string;
  niche: string;
  area: string;
  address: string;
  phone: string;
  website?: string | null;
  activePreviewSlug?: string | null;
}

/**
 * Automatically extracts lead metadata from Supabase for instant preview generation.
 * Zero manual typing required.
 */
export async function getLeadForPreview(leadId: string): Promise<LeadIntakeData> {
  const admin = getAdminClient();

  const { data: lead, error } = await admin
    .from("leads")
    .select("id, name, niche, area, address, phone, website, active_preview_slug")
    .eq("id", leadId)
    .single();

  if (error || !lead) {
    throw new Error(`Lead with ID "${leadId}" not found in database.`);
  }

  // Sensible fallbacks if lead record has partial data
  const name = (lead.name || "Local Business").trim();
  const niche = (lead.niche || "Professional Services").trim();
  const area = (lead.area || "Metro Area").trim();
  const address = (lead.address || `${area}, USA`).trim();
  const phone = (lead.phone || "").trim();

  return {
    id: lead.id,
    name,
    niche,
    area,
    address,
    phone,
    website: lead.website || null,
    activePreviewSlug: lead.active_preview_slug || null,
  };
}
