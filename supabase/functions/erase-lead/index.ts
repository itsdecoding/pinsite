// Supabase Edge Function: Erase Lead (DPDP Right to Erasure)
// POST /api/leads/:id/erase or /functions/v1/erase-lead

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const leadId = body.lead_id;

    if (!leadId) {
      return new Response(JSON.stringify({ error: "lead_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Retrieve lead
    const { data: lead, error: fetchErr } = await supabase
      .from("leads")
      .select("id, normalized_phone, phone")
      .eq("id", leadId)
      .maybeSingle();

    if (fetchErr || !lead) {
      return new Response(JSON.stringify({ error: "Lead not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Calculate SHA-256 phone hash
    const phoneToHash = lead.normalized_phone || lead.phone;
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(phoneToHash));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const phoneHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

    // 1. Insert into dnc_blacklist
    await supabase.from("dnc_blacklist").upsert({
      phone_hash: phoneHash,
      reason: "dpdp_right_to_erasure",
    });

    // 2. Redact personal data and flag DNC
    const { error: updateErr } = await supabase
      .from("leads")
      .update({
        name: "[REDACTED - DPDP]",
        phone: "[REDACTED]",
        normalized_phone: phoneHash.substring(0, 15),
        address: null,
        dnc_flag: true,
        status: "dnc",
        deleted_at: new Date().toISOString(),
      })
      .eq("id", leadId);

    if (updateErr) {
      throw updateErr;
    }

    return new Response(
      JSON.stringify({ success: true, message: "Lead successfully erased under DPDP compliance" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
