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
      if (!lead.name || !lead.phone || !lead.niche || !lead.area) {
        invalidCount++;
        continue;
      }

      // Format & sanitize
      const cleanPhone = lead.phone.replace(/[^0-9+]/g, "");
      const normalizedPhone = cleanPhone.startsWith("+")
        ? cleanPhone
        : cleanPhone.length === 10
        ? `+91${cleanPhone}`
        : cleanPhone;

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

      // Insert lead
      const { error: insertError } = await supabase.from("leads").insert({
        name: lead.name.trim(),
        phone: lead.phone.trim(),
        normalized_phone: normalizedPhone,
        website: lead.website || null,
        has_website: Boolean(lead.website || lead.has_website),
        address: lead.address || null,
        niche: lead.niche.trim(),
        area: lead.area.trim(),
        score: typeof lead.score === "number" ? lead.score : 70,
        status: "unassigned",
        source: source,
      });

      if (!insertError) {
        insertedCount++;
      } else {
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
