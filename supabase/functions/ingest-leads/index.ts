// Supabase Edge Function: Ingest Leads
// POST /api/leads/ingest or /functions/v1/ingest-leads
// Headers required:
//   Authorization: Bearer <INGESTION_API_KEY>
//   x-source: 'scraper' | 'csv_upload'
//   x-idempotency-key: <uuid or string> (optional per batch)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-source, x-idempotency-key",
};

interface LeadPayload {
  name: string;
  phone: string;
  website?: string;
  address?: string;
  niche: string;
  area: string;
  score?: number;
  place_id?: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const configuredApiKey = Deno.env.get("INGESTION_API_KEY") ?? "";

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Check Bearer token authorization
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "").trim();

    if (!token || (configuredApiKey && token !== configuredApiKey)) {
      return new Response(JSON.stringify({ error: "Unauthorized: Invalid ingestion API key" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Validate x-source strictly IN ('scraper', 'csv_upload')
    const source = req.headers.get("x-source");
    if (!source || !["scraper", "csv_upload"].includes(source)) {
      return new Response(
        JSON.stringify({ error: "Bad Request: Header x-source must be strictly 'scraper' or 'csv_upload'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Per-Source Rate Limit Check
    // scraper: Max 10 batches/min, csv_upload: Max 3 batches/min
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
    const { count: recentBatches, error: rateError } = await supabase
      .from("idempotency_keys")
      .select("*", { count: "exact", head: true })
      .eq("source", source)
      .gt("created_at", oneMinuteAgo);

    if (rateError) {
      console.error("Rate limit query error:", rateError);
    } else {
      const maxLimit = source === "scraper" ? 10 : 3;
      if (recentBatches !== null && recentBatches >= maxLimit) {
        return new Response(
          JSON.stringify({ error: `Rate limit exceeded for source '${source}'. Max ${maxLimit} batches per minute.` }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // 4. Idempotency Check
    const idempotencyKey = req.headers.get("x-idempotency-key");
    if (idempotencyKey) {
      const { data: existingKey } = await supabase
        .from("idempotency_keys")
        .select("key")
        .eq("key", idempotencyKey)
        .maybeSingle();

      if (existingKey) {
        return new Response(
          JSON.stringify({ message: "Duplicate batch skipped: idempotency key already processed", idempotencyKey }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const body = await req.json();
    const leadsRaw: LeadPayload[] = Array.isArray(body) ? body : body.leads ? body.leads : [body];

    if (!leadsRaw || leadsRaw.length === 0) {
      return new Response(JSON.stringify({ error: "No leads provided in payload" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. Normalization, DPDP Scrub & Deduplication
    let insertedCount = 0;
    let skippedDnc = 0;
    let skippedDuplicates = 0;
    let invalidCount = 0;

    for (const lead of leadsRaw) {
      if (!lead.name || !lead.phone || !lead.niche || !lead.area) {
        invalidCount++;
        continue;
      }

      // E.164 normalization (Indian numbers default if not formatted)
      const digits = lead.phone.replace(/\D/g, "");
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

      // SHA-256 hash for DPDP DNC scrub
      const encoder = new TextEncoder();
      const data = encoder.encode(normalizedPhone);
      const hashBuffer = await crypto.subtle.digest("SHA-256", data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const phoneHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

      // Check DNC Blacklist
      const { data: dncMatch } = await supabase
        .from("dnc_blacklist")
        .select("phone_hash")
        .eq("phone_hash", phoneHash)
        .maybeSingle();

      if (dncMatch) {
        skippedDnc++;
        continue;
      }

      // Check duplicate in leads
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
      const hasWebsite = Boolean(lead.website && lead.website.trim().length > 4);

      const { error: insertError } = await supabase.from("leads").insert({
        name: lead.name.trim(),
        phone: lead.phone.trim(),
        normalized_phone: normalizedPhone,
        website: lead.website || null,
        has_website: hasWebsite,
        address: lead.address || null,
        niche: lead.niche.trim(),
        area: lead.area.trim(),
        score: score,
        place_id: lead.place_id || null,
        status: "unassigned",
      });

      if (insertError) {
        console.error("Lead insert error:", insertError);
        invalidCount++;
      } else {
        insertedCount++;
      }
    }

    // Record idempotency key if provided
    if (idempotencyKey) {
      await supabase.from("idempotency_keys").insert({
        key: idempotencyKey,
        source: source,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        summary: {
          total_received: leadsRaw.length,
          inserted: insertedCount,
          skipped_dnc: skippedDnc,
          skipped_duplicates: skippedDuplicates,
          invalid: invalidCount,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
