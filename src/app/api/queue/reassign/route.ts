import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, verifyManagerSession } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const authResult = await verifyManagerSession(req);
    if ("error" in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }
    const { user } = authResult;
    const admin = getAdminClient();

    const { lead_id, caller_id, reason } = await req.json();

    if (!lead_id) {
      return NextResponse.json({ error: "Missing lead_id parameter" }, { status: 400 });
    }

    // Verify recipient caller role if caller_id is specified
    if (caller_id) {
      const { data: targetProf, error: targetProfErr } = await admin
        .from("profiles")
        .select("role, active")
        .eq("id", caller_id)
        .maybeSingle();

      if (targetProfErr || !targetProf || targetProf.role !== "caller" || targetProf.active === false) {
        return NextResponse.json(
          { error: "Target recipient must be an active team member with the caller role" },
          { status: 400 }
        );
      }
    }

    // 3. Fetch current lead assignment state for audit trail
    const { data: currentLead } = await admin
      .from("leads")
      .select("assigned_to, status")
      .eq("id", lead_id)
      .maybeSingle();

    const fromCallerId = currentLead?.assigned_to || null;
    const isCurrentlyInterested = currentLead?.status === "interested";

    // 4. Update lead assignment (clearing quarantine attribution & metadata if rescued)
    const updateData: Record<string, any> = {
      assigned_to: caller_id || null,
      status: caller_id ? (isCurrentlyInterested ? "interested" : "assigned") : "unassigned",
      assigned_date: caller_id ? new Date().toISOString().split("T")[0] : null,
      updated_at: new Date().toISOString(),
      quarantined_at: null,
      disposal_scheduled_at: null,
      rejection_reason: null,
      rejected_by: null,
      cooldown_until: null,
    };

    const { error: updateError } = await admin
      .from("leads")
      .update(updateData)
      .eq("id", lead_id);

    if (updateError) throw updateError;

    // 5. Log in assignment history with dual attribution
    const historyReason = reason || (caller_id ? "manager_manual_reassign" : "manager_unassigned");
    const historyPayload: Record<string, any> = {
      lead_id,
      from_caller_id: fromCallerId,
      to_caller_id: caller_id || null,
      assigned_by: user.id,
      reason: historyReason,
      acted_by: user.id,
      on_behalf_of: fromCallerId,
    };

    const { error: histError } = await admin.from("assignment_history").insert(historyPayload);
    if (histError) {
      // Fallback if schema migration for acted_by hasn't run yet
      delete historyPayload.acted_by;
      delete historyPayload.on_behalf_of;
      await admin.from("assignment_history").insert(historyPayload);
    }

    // 5. Notify the assigned caller if assigned
    if (caller_id) {
      await admin.from("notifications").insert({
        user_id: caller_id,
        type: "lead_assigned",
        title: "Lead Assigned",
        body: "A manager has assigned a new lead to your queue.",
        entity_type: "lead",
        entity_id: lead_id,
        link: "/queue",
      });
    }

    return NextResponse.json({
      success: true,
      lead_id,
      assigned_to: caller_id || null,
    });
  } catch (err: any) {
    console.error("Lead reassignment error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to reassign lead" },
      { status: 500 }
    );
  }
}
