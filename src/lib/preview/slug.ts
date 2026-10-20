import { getAdminClient } from "@/lib/supabase/admin";

export const RESERVED_SLUGS = new Set([
  "api",
  "auth",
  "dashboard",
  "queue",
  "projects",
  "comms",
  "studio",
  "login",
  "signup",
  "reset-password",
  "forgot-password",
  "unauthorized",
  "preview",
  "joshi-clinic",
  "joshi-dental-clinic",
  "admin",
  "settings",
  "_next",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
]);

/**
 * Strips corporate noise words and creates a punchy, executive 2-3 word slug.
 * e.g. "Perfect Smile Dental Clinic" -> "perfect-smile"
 * e.g. "Apex Orthodontics & Implant Centre" -> "apex-orthodontics"
 * e.g. "Joshi Clinic" -> "joshi-clinic"
 */
export function formatBaseSlug(businessName: string): string {
  let cleaned = (businessName || "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9\s-]/g, " ")
    .trim();

  // Words that can be stripped if there are already 2+ distinctive words in front
  const noiseSuffixes = [
    "dental clinic and implant centre",
    "dental clinic and implant center",
    "dental clinic",
    "dental care",
    "dental hospital",
    "dental centre",
    "dental center",
    "dental",
    "clinic",
    "hospital",
    "centre",
    "center",
    "pvt ltd",
    "private limited",
    "llp",
    "services",
    "solutions",
  ];

  for (const suffix of noiseSuffixes) {
    if (cleaned.endsWith(suffix) && cleaned.length > suffix.length + 3) {
      const candidate = cleaned.slice(0, cleaned.length - suffix.length).trim();
      // Ensure at least 1 strong word remains
      if (candidate.length >= 3) {
        cleaned = candidate;
        break;
      }
    }
  }

  const slug = cleaned
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)+/g, "")
    .slice(0, 28);

  return slug || "preview";
}

/**
 * Generates an executive, un-spammed slug guaranteed unique in the database.
 * No random hashes like -yp2r.
 * e.g. "perfect-smile" -> if taken, "perfect-smile-pune" -> if taken, "perfect-smile-2"
 */
export async function generateUniqueVanitySlug(
  businessName: string,
  areaOrCity?: string
): Promise<string> {
  const admin = getAdminClient();
  const baseSlug = formatBaseSlug(businessName);

  // 1. Try clean base slug (e.g. "perfect-smile")
  if (!RESERVED_SLUGS.has(baseSlug)) {
    const { data: existing } = await admin
      .from("website_previews")
      .select("id")
      .eq("slug", baseSlug)
      .maybeSingle();

    if (!existing) {
      return baseSlug;
    }
  }

  // 2. If taken, try appending clean short city/area (e.g. "perfect-smile-pune")
  if (areaOrCity) {
    const cleanArea = areaOrCity
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 10);
    if (cleanArea) {
      const areaSlug = `${baseSlug}-${cleanArea}`;
      if (!RESERVED_SLUGS.has(areaSlug)) {
        const { data: existingArea } = await admin
          .from("website_previews")
          .select("id")
          .eq("slug", areaSlug)
          .maybeSingle();

        if (!existingArea) {
          return areaSlug;
        }
      }
    }
  }

  // 3. Fallback cleanly with numeric counter: -2, -3 (NEVER random garble like -yp2r)
  for (let i = 2; i <= 20; i++) {
    const numSlug = `${baseSlug}-${i}`;
    if (!RESERVED_SLUGS.has(numSlug)) {
      const { data: existingNum } = await admin
        .from("website_previews")
        .select("id")
        .eq("slug", numSlug)
        .maybeSingle();

      if (!existingNum) {
        return numSlug;
      }
    }
  }

  return `${baseSlug}-${Date.now().toString().slice(-4)}`;
}
