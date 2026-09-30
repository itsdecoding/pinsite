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
    const targetCap = Number(body.target_cap) || 30;

    const admin = getAdminClient();

    // Try executing RPC first if database function is updated
    try {
      const { data: rpcData, error: rpcErr } = await admin.rpc("assign_daily_leads", {
        p_target_cap: targetCap,
      });
      if (!rpcErr && rpcData) {
        return NextResponse.json({
          success: true,
          assigned_count: rpcData.assigned_count ?? 0,
          message: `Distribution completed successfully (${rpcData.assigned_count ?? 0} leads assigned).`,
        });
      }
    } catch {
      // Fallback to application-layer depth-aware distribution below
    }

    // Application-layer depth-aware distribution:
    // 1. Fetch unassigned leads
    const { data: unassignedLeads, error: unassignedErr } = await admin
      .from("leads")
      .select("id")
      .eq("status", "unassigned")
      .is("deleted_at", null)
      .gte("score", 70)
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

    // Count active leads per caller
    const { data: activeLeads } = await admin
      .from("leads")
      .select("assigned_to")
      .is("deleted_at", null)
      .not("assigned_to", "is", null)
      .not("status", "in", '("closed_won","closed_lost","dnc","not_interested")');

    const counts = new Map<string, number>();
    for (const c of callers) counts.set(c.id, 0);
    for (const l of activeLeads || []) {
      if (counts.has(l.assigned_to)) {
        counts.set(l.assigned_to, (counts.get(l.assigned_to) || 0) + 1);
      }
    }

    // Sort callers by current load ASC (lightest caller first)
    const sortedCallers = [...callers].sort(
      (a, b) => (counts.get(a.id) || 0) - (counts.get(b.id) || 0)
    );

    let leadIndex = 0;
    let totalAssigned = 0;
    const todayStr = new Date().toISOString().split("T")[0];

    for (const caller of sortedCallers) {
      if (leadIndex >= unassignedLeads.length) break;

      const currentLoad = counts.get(caller.id) || 0;
      const needed = Math.max(0, targetCap - currentLoad);

      if (needed > 0) {
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
            reason: "daily_6am_topup",
          }));

          await admin.from("assignment_history").insert(historyEntries);

          try {
            await admin.from("notifications").insert({
              user_id: caller.id,
              type: "leads_ready",
              title: "Leads Ready",
              body: `${leadIds.length} leads assigned to your queue.`,
              link: "/queue",
            });
          } catch {
            // Non-critical
          }

          leadIndex += batch.length;
          totalAssigned += batch.length;
        }
      }
    }

    return NextResponse.json({
      success: true,
      assigned_count: totalAssigned,
      message: `Successfully distributed ${totalAssigned} leads to active callers.`,
    });
  } catch (err: any) {
    console.error("Distribute endpoint exception:", err);
    return NextResponse.json(
      { error: err.message || "Failed to distribute leads" },
      { status: 500 }
    );
  }
}
