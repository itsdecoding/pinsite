import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

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

    let insertedCount = 0;
    let skippedDnc = 0;
    let skippedDuplicates = 0;
    let invalidCount = 0;

    for (const lead of leadsRaw) {
      if (!lead.name || !lead.phone) {
        invalidCount++;
        continue;
      }

      const rawPhone = String(lead.phone).trim();

      // Reject non-phone text like "No Phone Number" or "N/A"
      if (
        rawPhone.toLowerCase().includes("no phone") ||
        rawPhone.toLowerCase().includes("n/a") ||
        rawPhone.toLowerCase() === "null" ||
        rawPhone.toLowerCase() === "undefined"
      ) {
        invalidCount++;
        continue;
      }

      // Extract numeric digits
      const digitsOnly = rawPhone.replace(/\D/g, "");
      if (digitsOnly.length < 7) {
        invalidCount++;
        continue;
      }

      // Smart normalization for Indian and international numbers
      let normalizedPhone = "";
      if (rawPhone.startsWith("+")) {
        normalizedPhone = "+" + digitsOnly;
      } else if (digitsOnly.length === 11 && digitsOnly.startsWith("0")) {
        // e.g. 08983019136 -> +918983019136
        normalizedPhone = "+91" + digitsOnly.substring(1);
      } else if (digitsOnly.length === 10) {
        // e.g. 8983019136 -> +918983019136
        normalizedPhone = "+91" + digitsOnly;
      } else if (digitsOnly.length === 12 && digitsOnly.startsWith("91")) {
        // e.g. 918983019136 -> +918983019136
        normalizedPhone = "+" + digitsOnly;
      } else {
        normalizedPhone = rawPhone.startsWith("+") ? rawPhone : `+${digitsOnly}`;
      }

      // Check DNC
      const { data: isDnc } = await supabase.rpc("is_dnc", { p_phone: normalizedPhone });
      if (isDnc) {
        skippedDnc++;
        continue;
      }

      // Check duplicates (by normalized_phone)
      const { data: existingLead } = await supabase
        .from("leads")
        .select("id")
        .eq("normalized_phone", normalizedPhone)
        .is("deleted_at", null)
        .maybeSingle();

      if (existingLead) {
        skippedDuplicates++;
        continue;
      }

      // Smart Area fallback if area is generic but address has city
      let area = (lead.area || "Mumbai").trim();
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

      const niche = (lead.niche || "General").trim();
      const hasWebsite = Boolean(lead.website && String(lead.website).trim().length > 0);

      // Insert lead
      const { error: insertError } = await supabase.from("leads").insert({
        name: String(lead.name).trim(),
        phone: rawPhone,
        normalized_phone: normalizedPhone,
        website: lead.website || null,
        has_website: hasWebsite,
        address: lead.address || null,
        niche: niche,
        area: area,
        score: typeof lead.score === "number" ? Math.min(100, Math.max(0, lead.score)) : 75,
        status: "unassigned",
        source: source,
      });

      if (!insertError) {
        insertedCount++;
      } else {
        console.error("Lead insert error:", insertError);
        invalidCount++;
      }
    }

    return NextResponse.json(
      {
        message: "Ingestion processed successfully",
        summary: {
          total_received: leadsRaw.length,
          inserted: insertedCount,
          skipped_dnc: skippedDnc,
          skipped_duplicates: skippedDuplicates,
          invalid: invalidCount,
        },
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("Ingestion endpoint exception:", err);
    return NextResponse.json({ error: err.message || "Failed to process lead batch" }, { status: 500 });
  }
}
