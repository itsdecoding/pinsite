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
  // 1. Check cookies session
  const serverSupabase = createServerClient();
  const {
    data: { user },
  } = await serverSupabase.auth.getUser();

  let activeUser = user;

  // 2. Check Bearer token in header if no cookie session
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

  // 3. Verify user has manager or admin privileges
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

    const admin = getAdminClient();

    // 1. Fetch user list from auth to map emails
    const emailMap = new Map<string, string>();
    try {
      const { data: authData } = await admin.auth.admin.listUsers({ perPage: 1000 });
      if (authData?.users) {
        for (const u of authData.users) {
          if (u.id && u.email) {
            emailMap.set(u.id, u.email);
          }
        }
      }
    } catch (authErr) {
      console.warn("Could not list auth users for email mapping:", authErr);
    }

    // 2. Fetch profiles
    const { data: allProfiles, error: profileErr } = await admin
      .from("profiles")
      .select("id, full_name, role, phone, is_available, active, require_password_change, temp_password_issued_at, created_at")
      .is("deleted_at", null)
      .order("active", { ascending: false })
      .order("full_name", { ascending: true });

    if (profileErr) {
      throw profileErr;
    }

    // Isolate callers (fallback to all profiles if no designated callers exist)
    const targetCallers =
      allProfiles?.filter((p) => p.role === "caller").length > 0
        ? allProfiles.filter((p) => p.role === "caller")
        : (allProfiles || []);

    // 3. Compute CURRENT_DATE start boundary in UTC ISO format
    const todayDateStr = new Date().toISOString().split("T")[0];
    const todayStartIso = `${todayDateStr}T00:00:00.000Z`;

    // 4. Fetch calls made today (called_at >= CURRENT_DATE)
    const { data: todayCalls, error: callsErr } = await admin
      .from("calls")
      .select("id, caller_id, outcome, duration_seconds, called_at, callback_at")
      .gte("called_at", todayStartIso);

    if (callsErr) {
      throw callsErr;
    }

    // 5. Fetch currently assigned active leads
    // assigned_to = caller.id AND deleted_at IS NULL AND status NOT IN ('closed_won','closed_lost','dnc','not_interested')
    const { data: activeLeads, error: leadsErr } = await admin
      .from("leads")
      .select("id, assigned_to, status")
      .is("deleted_at", null)
      .not("assigned_to", "is", null)
      .not("status", "in", '("closed_won","closed_lost","dnc","not_interested")');

    if (leadsErr) {
      throw leadsErr;
    }

    // 6. Aggregate metrics per caller
    const callsList = todayCalls || [];
    const leadsList = activeLeads || [];

    const connectOutcomes = new Set(["gatekeeper", "dm_reached", "interested", "callback", "closed_won"]);

    let totalDialsToday = 0;
    let totalConnectsToday = 0;
    let totalPipelineEscalations = 0;
    let activeCallersCount = 0;

    const callerStats = targetCallers.map((caller) => {
      const callerCalls = callsList.filter((c) => c.caller_id === caller.id);
      const dialsToday = callerCalls.length;

      const connectsToday = callerCalls.filter(
        (c) => connectOutcomes.has(c.outcome) || (Number(c.duration_seconds) || 0) >= 30
      ).length;

      const interestedToday = callerCalls.filter((c) => c.outcome === "interested").length;

      const callbacksToday = callerCalls.filter(
        (c) => c.outcome === "callback" || Boolean(c.callback_at)
      ).length;

      const talkTimeSeconds = callerCalls.reduce(
        (acc, c) => acc + (Number(c.duration_seconds) || 0),
        0
      );

      const activeLeadsCount = leadsList.filter((l) => l.assigned_to === caller.id).length;

      const isOnline = Boolean(caller.active && caller.is_available);
      if (isOnline) {
        activeCallersCount += 1;
      }

      totalDialsToday += dialsToday;
      totalConnectsToday += connectsToday;
      totalPipelineEscalations += interestedToday;

      return {
        id: caller.id,
        full_name: caller.full_name,
        email: emailMap.get(caller.id) || `${caller.full_name.toLowerCase().replace(/\s+/g, ".")}@agency.com`,
        role: caller.role,
        active: Boolean(caller.active),
        is_available: Boolean(caller.is_available),
        is_online: isOnline,
        require_password_change: Boolean(caller.require_password_change),
        temp_password_issued_at: caller.temp_password_issued_at || null,
        dials_today: dialsToday,
        connects_today: connectsToday,
        connect_rate_percent: dialsToday > 0 ? Math.round((connectsToday / dialsToday) * 100) : 0,
        interested_today: interestedToday,
        callbacks_today: callbacksToday,
        talk_time_seconds: talkTimeSeconds,
        active_leads_count: activeLeadsCount,
      };
    });

    // Also include any callers that had calls today even if role changed or wasn't strictly 'caller'
    return NextResponse.json({
      callers: callerStats,
      summary: {
        total_dials_today: totalDialsToday,
        total_connects_today: totalConnectsToday,
        total_pipeline_escalations: totalPipelineEscalations,
        active_callers: activeCallersCount,
        total_callers: targetCallers.length,
      },
      current_date: todayDateStr,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("Team stats error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to retrieve team stats" },
      { status: 500 }
    );
  }
}
