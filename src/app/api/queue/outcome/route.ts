import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    // 1. Authenticate user session
    const serverSupabase = createServerClient();
    let {
      data: { user },
    } = await serverSupabase.auth.getUser();

    const admin = createAdminClient(supabaseUrl, supabaseServiceKey);

    if (!user) {
      const authHeader = req.headers.get("authorization");
      if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.replace("Bearer ", "").trim();
        const { data: jwtData } = await admin.auth.getUser(token);
        user = jwtData.user;
      }
    }

    if (!user) {
      return NextResponse.json({ error: "Unauthorized: Active session required" }, { status: 401 });
    }

    // 2. Verify user profile and role
    const { data: profile } = await admin
      .from("profiles")
      .select("role, full_name")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile) {
      return NextResponse.json({ error: "Forbidden: User profile not found" }, { status: 403 });
    }

    const body = await req.json();
    const {
      p_lead_id,
      p_status,
      p_callback_at,
      p_notes,
      p_duration_seconds,
      p_client_offline_id,
    } = body;

    if (!p_lead_id || !p_status) {
      return NextResponse.json(
        { error: "Missing required parameters: p_lead_id, p_status" },
        { status: 400 }
      );
    }

    // 3. Fetch lead
    const { data: lead, error: leadError } = await admin
      .from("leads")
      .select("*")
      .eq("id", p_lead_id)
      .is("deleted_at", null)
      .single();

    if (leadError || !lead) {
      return NextResponse.json({ error: "Lead not found or has been deleted" }, { status: 404 });
    }

    // 4. Role Authorization Check:
    // - Managers and Admins can update any lead
    // - Callers can update their assigned leads, or unassigned leads (which auto-claims it)
    const isManagerOrAdmin = profile.role === "manager" || profile.role === "admin";
    if (!isManagerOrAdmin && lead.assigned_to && lead.assigned_to !== user.id) {
      return NextResponse.json(
        { error: "Forbidden: Lead is assigned to another team member" },
        { status: 403 }
      );
    }

    // 5. If DNC selected, atomically blacklist SHA-256 phone hash
    if (p_status === "dnc") {
      const phoneToHash = lead.normalized_phone || lead.phone;
      if (phoneToHash) {
        const phoneHash = crypto.createHash("sha256").update(phoneToHash.trim()).digest("hex");
        await admin.from("dnc_blacklist").upsert(
          { phone_hash: phoneHash, reason: "caller_dnc_request" },
          { onConflict: "phone_hash" }
        );
      }
    }

    // 6. Update lead state
    const leadUpdate: Record<string, any> = {
      status: p_status,
      assigned_to: lead.assigned_to || user.id,
      attempts_count: (lead.attempts_count || 0) + 1,
      last_called_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (p_status === "dnc") {
      leadUpdate.dnc_flag = true;
    }

    if (p_status === "callback" && p_callback_at) {
      leadUpdate.next_callback_at = p_callback_at;
    }

    const { error: updateError } = await admin
      .from("leads")
      .update(leadUpdate)
      .eq("id", p_lead_id);

    if (updateError) throw updateError;

    // 7. Insert call log record
    const callInsert: Record<string, any> = {
      lead_id: p_lead_id,
      caller_id: user.id,
      outcome: p_status,
      notes: p_notes?.trim() || null,
      duration_seconds: p_duration_seconds || 0,
      callback_at: p_status === "callback" && p_callback_at ? p_callback_at : null,
    };

    if (p_client_offline_id) {
      callInsert.client_offline_id = p_client_offline_id;
    }

    const { error: callError } = await admin.from("calls").insert(callInsert);
    if (callError) {
      // Ignore unique conflict on client_offline_id for idempotency
      if (!callError.message?.includes("client_offline_id")) {
        throw callError;
      }
    }

    return NextResponse.json({ success: true, lead_id: p_lead_id });
  } catch (err: any) {
    console.error("Error logging call outcome:", err);
    return NextResponse.json(
      { error: err.message || "Failed to log outcome" },
      { status: 500 }
    );
  }
}
