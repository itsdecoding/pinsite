import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import crypto from "crypto";

/**
 * Normalizes and formats lead names cleanly for data hygiene:
 * - Fixes "Dr.Archana" -> "Dr. Archana"
 * - Fixes "Dr Phadatare" -> "Dr. Phadatare"
 * - Fixes "Dr Namrata's-Samarth" -> "Dr. Namrata's - Samarth"
 * - Normalizes spacing
 */
function formatLeadName(rawName: string | null | undefined): string {
  if (!rawName) return "Unnamed Lead";
  let name = String(rawName).trim();
  name = name.replace(/([a-zA-Z0-9'’])\s*-\s*([a-zA-Z0-9])/g, "$1 - $2");
  name = name.replace(/\bDr\.([A-Za-z])/gi, "Dr. $1");
  name = name.replace(/\bDr(?!\.)\s+/gi, "Dr. ");
  name = name.replace(/\s+/g, " ").trim();
  return name;
}

export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const configuredApiKey = process.env.INGESTION_API_KEY;

    let isAuthorized = false;

    // Path A: Check for logged-in Manager or Admin user session (for browser CSV uploads)
    try {
      const serverSupabase = createServerClient();
      const {
        data: { user },
      } = await serverSupabase.auth.getUser();

      if (user) {
        const admin = createAdminClient(supabaseUrl, supabaseServiceKey);
        const { data: profile } = await admin
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();

        if (profile?.role === "admin" || profile?.role === "manager") {
          isAuthorized = true;
        }
      }
    } catch {
      // Continue to check Bearer token
    }

    // Path B: Check for external ingestion API key (for automated scrapers)
    if (!isAuthorized) {
      const authHeader = req.headers.get("authorization");
      const token = authHeader?.replace("Bearer ", "").trim();

      if (configuredApiKey && token && token === configuredApiKey) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return NextResponse.json(
        { error: "Unauthorized: Valid manager session or secret INGESTION_API_KEY required" },
        { status: 401 }
      );
    }

    // 2. Validate header x-source: strictly 'scraper' | 'csv_upload'
    const source = req.headers.get("x-source");
    if (!source || !["scraper", "csv_upload"].includes(source)) {
      return NextResponse.json(
        { error: "Bad Request: Header x-source must be strictly 'scraper' or 'csv_upload'" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const leadsRaw = Array.isArray(body) ? body : body.leads ? body.leads : [body];

    let invalidCount = 0;
    const candidates: Array<{
      lead: any;
      rawPhone: string;
      normalizedPhone: string;
      phoneHash: string;
    }> = [];

    // Step 1: Pre-process and filter obvious invalids
    for (const lead of leadsRaw) {
      if (!lead.name || !lead.phone) {
        invalidCount++;
        continue;
      }

      const rawPhone = String(lead.phone).trim();
      const lowerPhone = rawPhone.toLowerCase();

      if (
        lowerPhone.includes("no phone") ||
        lowerPhone.includes("n/a") ||
        lowerPhone === "null" ||
        lowerPhone === "undefined"
      ) {
        invalidCount++;
        continue;
      }

      const digitsOnly = rawPhone.replace(/\D/g, "");
      if (digitsOnly.length < 7) {
        invalidCount++;
        continue;
      }

      // Normalization
      let normalizedPhone = "";
      if (rawPhone.startsWith("+")) {
        normalizedPhone = "+" + digitsOnly;
      } else if (digitsOnly.length === 11 && digitsOnly.startsWith("0")) {
        normalizedPhone = "+91" + digitsOnly.substring(1);
      } else if (digitsOnly.length === 10) {
        normalizedPhone = "+91" + digitsOnly;
      } else if (digitsOnly.length === 12 && digitsOnly.startsWith("91")) {
        normalizedPhone = "+" + digitsOnly;
      } else {
        normalizedPhone = rawPhone.startsWith("+") ? rawPhone : `+${digitsOnly}`;
      }

      const phoneHash = crypto.createHash("sha256").update(normalizedPhone).digest("hex");

      candidates.push({
        lead,
        rawPhone,
        normalizedPhone,
        phoneHash,
      });
    }

    if (candidates.length === 0) {
      return NextResponse.json({
        message: "No valid lead candidates found in payload",
        summary: {
          total_received: leadsRaw.length,
          inserted: 0,
          skipped_dnc: 0,
          skipped_duplicates: 0,
          invalid: invalidCount,
        },
      });
    }

    // Step 2: Batch duplicate check in database
    const allNormalized = Array.from(new Set(candidates.map((c) => c.normalizedPhone)));
    const { data: existingRecords } = await supabase
      .from("leads")
      .select("normalized_phone")
      .in("normalized_phone", allNormalized)
      .is("deleted_at", null);

    const existingPhoneSet = new Set(existingRecords?.map((r) => r.normalized_phone) || []);

    // Step 3: Batch DNC check (DPDP Compliance against dnc_blacklist)
    const allHashes = Array.from(new Set(candidates.map((c) => c.phoneHash)));
    const { data: dncRecords, error: dncErr } = await supabase
      .from("dnc_blacklist")
      .select("phone_hash")
      .in("phone_hash", allHashes);

    if (dncErr) {
      console.warn("Could not query dnc_blacklist during ingestion:", dncErr.message);
    }

    const dncHashSet = new Set(dncRecords?.map((d) => d.phone_hash) || []);

    // Step 4: Prepare batch insert rows (in-memory deduplication as well)
    const seenInThisBatch = new Set<string>();
    const rowsToInsert: any[] = [];
    let skippedDuplicates = 0;
    let skippedDnc = 0;

    for (const item of candidates) {
      const { lead, rawPhone, normalizedPhone, phoneHash } = item;

      if (dncHashSet.has(phoneHash)) {
        skippedDnc++;
        continue;
      }

      if (existingPhoneSet.has(normalizedPhone) || seenInThisBatch.has(normalizedPhone)) {
        skippedDuplicates++;
        continue;
      }

      seenInThisBatch.add(normalizedPhone);

      // Smart Area refinement
      let area = (lead.area || "Pune").trim();
      const addr = (lead.address || "").toLowerCase();
      if (area.toLowerCase() === "mumbai" || area.toLowerCase() === "general") {
        if (addr.includes("kothrud")) area = "Kothrud, Pune";
        else if (addr.includes("aundh")) area = "Aundh, Pune";
        else if (addr.includes("hadapsar")) area = "Hadapsar, Pune";
        else if (addr.includes("baner")) area = "Baner, Pune";
        else if (addr.includes("pune")) area = "Pune";
        else if (addr.includes("bandra")) area = "Bandra, Mumbai";
        else if (addr.includes("colaba")) area = "Colaba, Mumbai";
        else if (addr.includes("thane")) area = "Thane";
        else if (addr.includes("hyderabad")) area = "Hyderabad";
        else if (addr.includes("bengaluru") || addr.includes("bangalore")) area = "Bengaluru";
      }

      const niche = (lead.niche || "Dentist").trim();
      const hasWebsite = Boolean(lead.website && String(lead.website).trim().length > 0);

      // Multidimensional lead opportunity scoring formula
      let computedScore = 50;
      if (rawPhone && rawPhone.trim().length >= 10) computedScore += 15;
      if (normalizedPhone.startsWith("+91")) computedScore += 5;
      const isMapsLink = !lead.website || lead.website.includes("google.com/maps") || lead.website.includes("maps.google");
      if (isMapsLink) computedScore += 15; // Highest website pitch opportunity
      else computedScore += 5;

      const addrLower = (lead.address || area || "").toLowerCase();
      if (addrLower.includes("kothrud") || addrLower.includes("baner") || addrLower.includes("aundh")) computedScore += 10;
      else if (addrLower.includes("hadapsar") || addrLower.includes("shivaji nagar") || addrLower.includes("pune")) computedScore += 7;
      else computedScore += 4;

      const nameLower = (lead.name || "").toLowerCase();
      if (nameLower.includes("dr.") || nameLower.includes("dr ")) computedScore += 5;

      const finalScore = typeof lead.score === "number" && !isNaN(lead.score)
        ? Math.min(100, Math.max(0, lead.score))
        : Math.min(100, Math.max(0, computedScore));

      // NOTE: public.leads table does NOT have a 'source' column.
      rowsToInsert.push({
        name: formatLeadName(lead.name),
        phone: rawPhone,
        normalized_phone: normalizedPhone,
        website: lead.website || null,
        has_website: hasWebsite,
        address: lead.address || null,
        niche: niche,
        area: area,
        score: finalScore,
        status: "unassigned",
      });
    }

    // Step 5: Execute single high-performance batch insert
    let insertedCount = 0;
    if (rowsToInsert.length > 0) {
      const { error: insertError } = await supabase.from("leads").insert(rowsToInsert);
      if (insertError) {
        console.error("Batch insert error:", insertError);
        throw new Error(insertError.message || "Failed to insert lead batch into database");
      }
      insertedCount = rowsToInsert.length;
    }

    return NextResponse.json({
      message: "Ingestion processed successfully",
      summary: {
        total_received: leadsRaw.length,
        inserted: insertedCount,
        skipped_dnc: skippedDnc,
        skipped_duplicates: skippedDuplicates,
        invalid: invalidCount,
      },
    });
  } catch (err: any) {
    console.error("Ingestion endpoint exception:", err);
    return NextResponse.json({ error: err.message || "Failed to process lead batch" }, { status: 500 });
  }
}
