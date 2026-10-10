import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createAdminClient(supabaseUrl, supabaseServiceKey);
}

async function verifyManagerSession(req: NextRequest) {
  const serverSupabase = createServerClient();
  const {
    data: { user },
  } = await serverSupabase.auth.getUser();

  let activeUser = user;

  if (!activeUser) {
    const authHeader = req.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "").trim();
      const admin = getAdminClient();
      const { data: jwtData } = await admin.auth.getUser(token);
      activeUser = jwtData.user;
    }
  }

  if (!activeUser) {
    return { error: "Unauthorized: Active session required", status: 401 };
  }

  const admin = getAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", activeUser.id)
    .maybeSingle();

  const role = profile?.role || "caller";
  if (role !== "admin" && role !== "manager") {
    return { error: "Forbidden: Manager or Admin role required", status: 403 };
  }

  return { user: activeUser, role };
}

export async function POST(req: NextRequest) {
  try {
    const authResult = await verifyManagerSession(req);
    if ("error" in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const body = await req.json().catch(() => ({}));
    const targetCap = Number(body.target_cap) || 100;

    const admin = getAdminClient();

    // Try executing RPC first if database function is updated
    try {
      const { data: rpcData, error: rpcErr } = await admin.rpc("assign_daily_leads", {
        p_target_cap: targetCap,
      });
      if (!rpcErr && rpcData && rpcData.success) {
        // Fetch current active load per caller to provide transparent breakdown
        const { data: activeCallers } = await admin
          .from("profiles")
          .select("id, full_name")
          .eq("role", "caller")
          .eq("active", true)
          .is("deleted_at", null)
          .order("full_name", { ascending: true });

        const callerIds = (activeCallers || []).map((c) => c.id);
        const { data: callerActiveLeads } = await admin
          .from("leads")
          .select("assigned_to")
          .in("assigned_to", callerIds)
          .is("deleted_at", null)
          .not("status", "in", '("closed_won","closed_lost","dnc","not_interested","interested")');

        const counts = new Map<string, number>();
        for (const cid of callerIds) counts.set(cid, 0);
        for (const l of callerActiveLeads || []) {
          if (l.assigned_to) counts.set(l.assigned_to, (counts.get(l.assigned_to) || 0) + 1);
        }

        const callersBreakdown = (activeCallers || []).map((c) => ({
          id: c.id,
          name: c.full_name,
          total: counts.get(c.id) || 0,
          target: targetCap,
        }));

        return NextResponse.json({
          success: true,
          assigned_count: rpcData.assigned_count ?? 0,
          remaining_pool: rpcData.remaining_pool ?? 0,
          callers_breakdown: callersBreakdown,
          message: `Distribution completed successfully (${rpcData.assigned_count ?? 0} leads assigned across ${activeCallers?.length || 0} callers).`,
        });
      }
    } catch {
      // Fallback to application-layer depth-aware distribution below
    }

    // Application-layer depth-aware distribution:
    // 1. Fetch unassigned leads (ordered by score DESC, no rigid score cutoff so all scraped leads distribute)
    const { data: unassignedLeads, error: unassignedErr } = await admin
      .from("leads")
      .select("id")
      .eq("status", "unassigned")
      .is("deleted_at", null)
      .eq("dnc_flag", false)
      .order("score", { ascending: false })
      .order("created_at", { ascending: true });

    if (unassignedErr) throw unassignedErr;

    if (!unassignedLeads || unassignedLeads.length === 0) {
      return NextResponse.json({
        success: true,
        assigned_count: 0,
        message: "Unassigned pool is empty. No new leads to distribute.",
      });
    }

    // 2. Fetch active callers and their current active queue load
    const { data: callers, error: callersErr } = await admin
      .from("profiles")
      .select("id, full_name")
      .eq("role", "caller")
      .eq("active", true)
      .is("deleted_at", null);

    if (callersErr) throw callersErr;

    if (!callers || callers.length === 0) {
      return NextResponse.json(
        { error: "No active callers found to receive leads" },
        { status: 400 }
      );
    }

    // Count active leads per caller (strictly excluding closed, DNC, bad fit, and interested prospects)
    const { data: activeLeads } = await admin
      .from("leads")
      .select("assigned_to")
      .is("deleted_at", null)
      .not("assigned_to", "is", null)
      .not("status", "in", '("closed_won","closed_lost","dnc","not_interested","interested")');

    const counts = new Map<string, number>();
    for (const c of callers) counts.set(c.id, 0);
    for (const l of activeLeads || []) {
      if (counts.has(l.assigned_to)) {
        counts.set(l.assigned_to, (counts.get(l.assigned_to) || 0) + 1);
      }
    }

    // Sort callers by current load ASC (lightest caller first for fair equalization)
    const sortedCallers = [...callers].sort(
      (a, b) => (counts.get(a.id) || 0) - (counts.get(b.id) || 0)
    );

    let leadIndex = 0;
    let totalAssigned = 0;
    const todayStr = new Date().toISOString().split("T")[0];
    const callersBreakdown: Array<{
      id: string;
      name: string;
      before: number;
      assigned: number;
      total: number;
      target: number;
    }> = [];

    for (const caller of sortedCallers) {
      const currentLoad = counts.get(caller.id) || 0;
      const needed = Math.max(0, targetCap - currentLoad);
      let assignedToCaller = 0;

      if (needed > 0 && leadIndex < unassignedLeads.length) {
        const batch = unassignedLeads.slice(leadIndex, leadIndex + needed);
        if (batch.length > 0) {
          const leadIds = batch.map((l) => l.id);

          await admin
            .from("leads")
            .update({
              status: "assigned",
              assigned_to: caller.id,
              assigned_date: todayStr,
              updated_at: new Date().toISOString(),
            })
            .in("id", leadIds);

          const historyEntries = leadIds.map((lid) => ({
            lead_id: lid,
            to_caller_id: caller.id,
            assigned_by: authResult.user.id,
            reason: "daily_distribution_topup",
          }));

          await admin.from("assignment_history").insert(historyEntries);

          try {
            await admin.from("notifications").insert({
              user_id: caller.id,
              type: "leads_ready",
              title: "Leads Ready",
              body: `${leadIds.length} leads assigned to your queue (daily top-up to ${targetCap}).`,
              link: "/queue",
            });
          } catch {
            // Non-critical
          }

          leadIndex += batch.length;
          totalAssigned += batch.length;
          assignedToCaller = batch.length;
        }
      }

      callersBreakdown.push({
        id: caller.id,
        name: caller.full_name,
        before: currentLoad,
        assigned: assignedToCaller,
        total: currentLoad + assignedToCaller,
        target: targetCap,
      });
    }

    const remainingPool = unassignedLeads.length - totalAssigned;

    return NextResponse.json({
      success: true,
      assigned_count: totalAssigned,
      remaining_pool: remainingPool,
      callers_breakdown: callersBreakdown,
      message: `Successfully distributed ${totalAssigned} leads to ${callers.length} active callers.`,
    });
  } catch (err: any) {
    console.error("Distribute endpoint exception:", err);
    return NextResponse.json(
      { error: err.message || "Failed to distribute leads" },
      { status: 500 }
    );
  }
}
