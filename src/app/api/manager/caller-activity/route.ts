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

export async function GET(req: NextRequest) {
  try {
    const authResult = await verifyManagerSession(req);
    if ("error" in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { searchParams } = new URL(req.url);
    const callerId = searchParams.get("caller_id");

    if (!callerId) {
      return NextResponse.json({ error: "caller_id query parameter is required" }, { status: 400 });
    }

    const admin = getAdminClient();

    // 1. Fetch profile
    const { data: profile, error: profErr } = await admin
      .from("profiles")
      .select("id, full_name, role, phone, is_available, active, require_password_change, temp_password_issued_at, created_at")
      .eq("id", callerId)
      .maybeSingle();

    if (profErr || !profile) {
      return NextResponse.json({ error: "Caller profile not found" }, { status: 404 });
    }

    // 2. Resolve real email
    let email = "Email unavailable";
    const { data: inv } = await admin
      .from("invites")
      .select("email")
      .eq("accepted_by", callerId)
      .maybeSingle();

    if (inv?.email) {
      email = inv.email;
    } else {
      try {
        const { data: uData } = await admin.auth.admin.getUserById(callerId);
        if (uData?.user?.email) {
          email = uData.user.email;
        }
      } catch {
        // Fallback
      }
    }

    const rangeParam = searchParams.get("range") || "today"; // "today" | "24h" | "all"

    // 3. Compute time boundaries (IST: Asia/Kolkata, UTC+5:30) identically to team-stats
    const now = new Date();
    let filterStartIso: string | null = null;
    let rangeLabel = "Today (IST)";

    if (rangeParam === "24h") {
      const past24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      filterStartIso = past24h.toISOString();
      rangeLabel = "Last 24 Hours";
    } else if (rangeParam === "all") {
      filterStartIso = null;
      rangeLabel = "All Time";
    } else {
      const istOffsetMs = 5.5 * 60 * 60 * 1000;
      const istNow = new Date(now.getTime() + istOffsetMs);
      const istDateStr = istNow.toISOString().split("T")[0]; // YYYY-MM-DD
      const istStartUtc = new Date(new Date(`${istDateStr}T00:00:00.000Z`).getTime() - istOffsetMs);
      filterStartIso = istStartUtc.toISOString();
      rangeLabel = "Today (IST)";
    }

    // 4. Fetch calls for this caller
    let callsQuery = admin
      .from("calls")
      .select("id, lead_id, outcome, duration_seconds, notes, called_at, callback_at")
      .eq("caller_id", callerId);

    if (filterStartIso) {
      callsQuery = callsQuery.gte("called_at", filterStartIso);
    }

    const { data: calls, error: callsErr } = await callsQuery
      .order("called_at", { ascending: false })
      .limit(100);

    if (callsErr) {
      throw callsErr;
    }

    // Also get all-time calls count for context
    const { count: allTimeDialsCount } = await admin
      .from("calls")
      .select("id", { count: "exact", head: true })
      .eq("caller_id", callerId);

    // Map lead details for each call
    const leadIds = Array.from(new Set((calls || []).map((c) => c.lead_id).filter(Boolean)));
    const leadsMap = new Map<string, any>();

    if (leadIds.length > 0) {
      const { data: relatedLeads } = await admin
        .from("leads")
        .select("id, name, phone, niche, area, status, attempts_count")
        .in("id", leadIds);

      if (relatedLeads) {
        for (const l of relatedLeads) {
          leadsMap.set(l.id, l);
        }
      }
    }

    const callLogs = (calls || []).map((c) => {
      const lead = c.lead_id ? leadsMap.get(c.lead_id) : null;
      return {
        id: c.id,
        called_at: c.called_at,
        outcome: c.outcome,
        duration_seconds: c.duration_seconds || 0,
        notes: c.notes || null,
        callback_at: c.callback_at || null,
        lead: lead
          ? {
              id: lead.id,
              name: lead.name,
              phone: lead.phone,
              niche: lead.niche,
              area: lead.area,
              status: lead.status,
              attempts_count: lead.attempts_count,
            }
          : null,
      };
    });

    // 5. Fetch active leads currently assigned to caller
    const { data: activeLeads, error: activeLeadsErr } = await admin
      .from("leads")
      .select("id, name, phone, niche, area, score, attempts_count, next_callback_at, last_called_at, status, cooldown_until")
      .eq("assigned_to", callerId)
      .is("deleted_at", null)
      .not("status", "in", '("closed_won","closed_lost","dnc","not_interested")')
      .order("score", { ascending: false })
      .limit(100);

    if (activeLeadsErr) {
      throw activeLeadsErr;
    }

    // 6. Partition active leads into 4-state pipeline
    const leadsList = activeLeads || [];
    let dialNowCount = 0;
    let callbacksCount = 0;
    let overdueCallbacksCount = 0;
    let waitingCount = 0;

    leadsList.forEach((lead) => {
      const isCallback = lead.status === "callback" || Boolean(lead.next_callback_at);
      const isCooldown = lead.cooldown_until && new Date(lead.cooldown_until) > now;

      if (isCallback) {
        callbacksCount += 1;
        if (lead.next_callback_at && new Date(lead.next_callback_at) < now) {
          overdueCallbacksCount += 1;
        }
      } else if (isCooldown) {
        waitingCount += 1;
      } else {
        dialNowCount += 1;
      }
    });

    // 7. Aggregate summary
    const totalDials = callLogs.length;
    const connects = callLogs.filter((c) =>
      ["interested", "callback", "gatekeeper", "dm_reached", "closed_won"].includes(c.outcome)
    ).length;
    const totalTalkTime = callLogs.reduce((acc, c) => acc + c.duration_seconds, 0);

    return NextResponse.json({
      caller: {
        ...profile,
        email,
        is_online: Boolean(profile.active && profile.is_available),
      },
      summary: {
        total_dials: totalDials,
        all_time_dials: allTimeDialsCount || totalDials,
        connects,
        connect_rate: totalDials >= 10 ? Math.round((connects / totalDials) * 100) : null,
        talk_time_seconds: totalTalkTime,
        active_queue_count: leadsList.length,
        range: rangeParam,
        range_label: rangeLabel,
        pipeline: {
          dial_now: dialNowCount,
          callbacks: callbacksCount,
          overdue_callbacks: overdueCallbacksCount,
          waiting: waitingCount,
          done: totalDials,
          total_assigned: leadsList.length,
        },
      },
      calls: callLogs,
      active_leads: leadsList,
    });
  } catch (err: any) {
    console.error("Caller activity error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to retrieve caller activity" },
      { status: 500 }
    );
  }
}
