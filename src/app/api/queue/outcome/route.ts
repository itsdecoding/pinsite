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
      p_rejection_reason,
      p_impersonate_caller_id,
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

    // Resolve caller identity and Mirror Mode audit trail
    let effectiveCallerId = user.id;
    let actedById: string | null = null;
    let onBehalfOfId: string | null = null;

    if (p_impersonate_caller_id) {
      if (!isManagerOrAdmin) {
        return NextResponse.json(
          { error: "Forbidden: Only managers and admins can log on behalf of callers" },
          { status: 403 }
        );
      }

      const { data: impProfile } = await admin
        .from("profiles")
        .select("id, role, active")
        .eq("id", p_impersonate_caller_id)
        .maybeSingle();

      if (!impProfile || impProfile.role !== "caller" || impProfile.active === false) {
        return NextResponse.json(
          { error: "Impersonated user must be an active team member with the caller role" },
          { status: 400 }
        );
      }

      effectiveCallerId = impProfile.id;
      actedById = user.id;
      onBehalfOfId = impProfile.id;
    } else if (isManagerOrAdmin && lead.assigned_to && lead.assigned_to !== user.id) {
      // If manager logs an outcome for a lead assigned to a caller, track audit trail
      actedById = user.id;
      onBehalfOfId = lead.assigned_to;
      effectiveCallerId = lead.assigned_to;
    }

    // 5. If DNC selected, atomically blacklist SHA-256 phone hash
    if (p_status === "dnc") {
      const phoneToHash = lead.normalized_phone || lead.phone;
      if (phoneToHash) {
        const phoneHash = crypto.createHash("sha256").update(phoneToHash.trim()).digest("hex");
        await admin.from("dnc_blacklist").upsert(
          {
            phone_hash: phoneHash,
            reason: p_rejection_reason?.trim() || "caller_dnc_request",
          },
          { onConflict: "phone_hash" }
        );
      }
    }

    // 6. Update lead state with application-layer lifecycle parity
    const newAttemptsCount = (lead.attempts_count || 0) + 1;
    const nowIso = new Date().toISOString();

    const leadUpdate: Record<string, any> = {
      status: p_status,
      assigned_to: lead.assigned_to || effectiveCallerId,
      attempts_count: newAttemptsCount,
      last_called_at: nowIso,
      updated_at: nowIso,
    };

    if (p_status === "dnc") {
      leadUpdate.dnc_flag = true;
      leadUpdate.assigned_to = null;
      leadUpdate.deleted_at = nowIso;
    } else if (p_status === "not_interested") {
      leadUpdate.rejection_reason = p_rejection_reason?.trim() || "Rejected by caller";
      leadUpdate.quarantined_at = nowIso;
      const disposalDate = new Date();
      disposalDate.setDate(disposalDate.getDate() + 7);
      leadUpdate.disposal_scheduled_at = disposalDate.toISOString();
      leadUpdate.rejected_by = lead.assigned_to || effectiveCallerId;
      leadUpdate.assigned_to = null;
      leadUpdate.cooldown_until = null;
    } else if (p_status === "interested") {
      leadUpdate.escalated_at = nowIso;
      leadUpdate.cooldown_until = null;
    } else if (p_status === "callback" && p_callback_at) {
      leadUpdate.next_callback_at = p_callback_at;
    } else if (p_status === "no_answer" || p_status === "gatekeeper") {
      if (newAttemptsCount === 1) {
        leadUpdate.cooldown_until = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();
      } else if (newAttemptsCount === 2) {
        leadUpdate.cooldown_until = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      } else if (newAttemptsCount === 3) {
        leadUpdate.cooldown_until = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
      } else if (newAttemptsCount === 4) {
        leadUpdate.cooldown_until = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
      } else {
        // >= 5 attempts -> Cadence exhausted -> Auto-quarantine
        leadUpdate.status = "not_interested";
        leadUpdate.rejection_reason = "Cadence exhausted (5 attempts with no contact)";
        leadUpdate.quarantined_at = nowIso;
        const disposalDate = new Date();
        disposalDate.setDate(disposalDate.getDate() + 7);
        leadUpdate.disposal_scheduled_at = disposalDate.toISOString();
        leadUpdate.rejected_by = lead.assigned_to || effectiveCallerId;
        leadUpdate.assigned_to = null;
        leadUpdate.cooldown_until = null;
      }
    }

    let { error: updateError } = await admin
      .from("leads")
      .update(leadUpdate)
      .eq("id", p_lead_id);

    // If trigger fails on digest (42883) or missing column, ensure soft delete & dnc_flag are guaranteed
    if (updateError && (updateError.code === "42883" || updateError.message?.includes("digest"))) {
      console.warn("Trigger digest error encountered during DNC update; applying direct soft delete fallback");
      const fallbackDncUpdate: Record<string, any> = {
        deleted_at: nowIso,
        dnc_flag: true,
        assigned_to: null,
        updated_at: nowIso,
      };
      const retryDnc = await admin.from("leads").update(fallbackDncUpdate).eq("id", p_lead_id);
      updateError = retryDnc.error;
    } else if (updateError && (updateError.message?.includes("rejection_reason") || updateError.code === "42703")) {
      delete leadUpdate.rejection_reason;
      delete leadUpdate.quarantined_at;
      delete leadUpdate.disposal_scheduled_at;
      delete leadUpdate.rejected_by;
      delete leadUpdate.cooldown_until;
      delete leadUpdate.escalated_at;
      const retryUpdate = await admin
        .from("leads")
        .update(leadUpdate)
        .eq("id", p_lead_id);
      updateError = retryUpdate.error;
    }

    if (updateError) throw updateError;

    // 7. Insert call log record
    const callInsert: Record<string, any> = {
      lead_id: p_lead_id,
      caller_id: effectiveCallerId,
      outcome: p_status,
      notes: p_notes?.trim() || null,
      duration_seconds: p_duration_seconds || 0,
      callback_at: p_status === "callback" && p_callback_at ? p_callback_at : null,
    };

    if (actedById) {
      callInsert.acted_by = actedById;
    }
    if (onBehalfOfId) {
      callInsert.on_behalf_of = onBehalfOfId;
    }

    if (p_client_offline_id) {
      callInsert.client_offline_id = p_client_offline_id;
    }

    let { error: callError } = await admin.from("calls").insert(callInsert);
    if (callError && (callError.message?.includes("acted_by") || callError.message?.includes("on_behalf_of") || callError.code === "42703")) {
      delete callInsert.acted_by;
      delete callInsert.on_behalf_of;
      const retryCall = await admin.from("calls").insert(callInsert);
      callError = retryCall.error;
    }

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
