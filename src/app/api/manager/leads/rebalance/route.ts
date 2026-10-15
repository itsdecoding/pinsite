import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, verifyManagerSession } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const authResult = await verifyManagerSession(req);
    if ("error" in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { source_caller_id, target_caller_id, count } = await req.json();

    if (!source_caller_id || !target_caller_id) {
      return NextResponse.json(
        { error: "Both source_caller_id and target_caller_id are required" },
        { status: 400 }
      );
    }

    if (source_caller_id === target_caller_id) {
      return NextResponse.json(
        { error: "Source and target caller must be different" },
        { status: 400 }
      );
    }

    const rebalanceCount = Number(count) || 10;
    if (rebalanceCount <= 0) {
      return NextResponse.json({ error: "Count must be greater than 0" }, { status: 400 });
    }

    const admin = getAdminClient();

    // Verify target user has role 'caller'
    const { data: targetProfile, error: targetProfileErr } = await admin
      .from("profiles")
      .select("role")
      .eq("id", target_caller_id)
      .maybeSingle();

    if (targetProfileErr || !targetProfile || targetProfile.role !== "caller") {
      return NextResponse.json(
        { error: "Target recipient must be an active team member with the caller role" },
        { status: 400 }
      );
    }

    // 1. Fetch eligible active leads from source caller
    // Prioritize uncalled leads (attempts_count = 0), then oldest
    const { data: eligibleLeads, error: selectErr } = await admin
      .from("leads")
      .select("id, name, phone")
      .eq("assigned_to", source_caller_id)
      .is("deleted_at", null)
      .not("status", "in", '("closed_won","closed_lost","dnc","not_interested","interested")')
      .order("attempts_count", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(rebalanceCount);

    if (selectErr) {
      throw selectErr;
    }

    if (!eligibleLeads || eligibleLeads.length === 0) {
      return NextResponse.json(
        { error: "No eligible active leads found in source caller's queue to rebalance" },
        { status: 400 }
      );
    }

    const leadIdsToMove = eligibleLeads.map((l) => l.id);
    const todayStr = new Date().toISOString().split("T")[0];

    // 2. Batch update leads to target caller
    const { error: updateErr } = await admin
      .from("leads")
      .update({
        assigned_to: target_caller_id,
        status: "assigned",
        assigned_date: todayStr,
        cooldown_until: null,
        updated_at: new Date().toISOString(),
      })
      .in("id", leadIdsToMove);

    if (updateErr) {
      throw updateErr;
    }

    // 3. Insert assignment history records for audit trail
    const historyEntries = leadIdsToMove.map((leadId) => ({
      lead_id: leadId,
      from_caller_id: source_caller_id,
      to_caller_id: target_caller_id,
      assigned_by: authResult.user.id,
      reason: "manager_bulk_rebalance",
    }));

    await admin.from("assignment_history").insert(historyEntries);

    // 4. Notify the receiving caller
    try {
      await admin.from("notifications").insert({
        user_id: target_caller_id,
        type: "lead_assigned",
        title: "Leads Rebalanced",
        body: `A manager transferred ${leadIdsToMove.length} leads to your queue.`,
        entity_type: "lead",
        entity_id: leadIdsToMove[0],
        link: "/studio/queue",
      });
    } catch (notifErr) {
      console.warn("Could not insert rebalance notification:", notifErr);
    }

    return NextResponse.json({
      success: true,
      rebalanced_count: leadIdsToMove.length,
      source_caller_id,
      target_caller_id,
    });
  } catch (err: any) {
    console.error("Rebalance error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to rebalance leads" },
      { status: 500 }
    );
  }
}
