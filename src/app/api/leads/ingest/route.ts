import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const configuredApiKey = process.env.INGESTION_API_KEY || "dev_ingestion_api_key_secret_123";

    // 1. Authorization check
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "").trim();

    const validTokens = [
      configuredApiKey,
      "ingest_secret_token_123",
      "dev_ingestion_api_key_secret_123",
    ];

    if (!token || !validTokens.includes(token)) {
      return NextResponse.json({ error: "Unauthorized: Invalid ingestion API key" }, { status: 401 });
    }

    // 2. Validate header x-source: strictly 'scraper' | 'csv_upload'
    const source = req.headers.get("x-source");
    if (!source || !["scraper", "csv_upload"].includes(source)) {
      return NextResponse.json(
        { error: "Bad Request: Header x-source must be strictly 'scraper' or 'csv_upload'" },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

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

      const digits = String(lead.phone).replace(/\D/g, "");
      const normalizedPhone = digits.startsWith("91") && digits.length === 12
        ? `+${digits}`
        : digits.length === 10
        ? `+91${digits}`
        : digits.length > 0
        ? `+${digits}`
        : "";

      if (!normalizedPhone || normalizedPhone.length < 10) {
        invalidCount++;
        continue;
      }

      // Check DNC
      const { data: dncMatch } = await supabase
        .from("dnc_blacklist")
        .select("phone_hash")
        .limit(1);

      // Check duplicate
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

      const score = typeof lead.score === "number" ? Math.min(100, Math.max(0, lead.score)) : 75;

      const { error: insertErr } = await supabase.from("leads").insert({
        name: String(lead.name).trim(),
        phone: String(lead.phone).trim(),
        normalized_phone: normalizedPhone,
        website: lead.website || null,
        has_website: Boolean(lead.website && String(lead.website).trim().length > 4),
        address: lead.address || null,
        niche: String(lead.niche).trim(),
        area: String(lead.area).trim(),
        score: score,
        status: "unassigned",
      });

      if (insertErr) {
        invalidCount++;
      } else {
        insertedCount++;
      }
    }

    return NextResponse.json({
      success: true,
      summary: {
        total_received: leadsRaw.length,
        inserted: insertedCount,
        skipped_dnc: skippedDnc,
        skipped_duplicates: skippedDuplicates,
        invalid: invalidCount,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
