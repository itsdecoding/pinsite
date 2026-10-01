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
    const { searchParams } = new URL(req.url);
    const rangeParam = searchParams.get("range") || "today"; // "today" | "24h"

    // 1. Fetch profiles for team members (excluding system bot and workspace owner)
    const { data: profData, error: profileErr } = await admin
      .from("profiles")
      .select("id, full_name, role, phone, is_available, active, require_password_change, temp_password_issued_at, created_at")
      .is("deleted_at", null)
      .neq("id", "00000000-0000-0000-0000-000000000001")
      .neq("id", "a87c7c79-6c4c-4787-8132-8cff8f7a1e74")
      .order("active", { ascending: false })
      .order("full_name", { ascending: true });

    if (profileErr) {
      throw profileErr;
    }

    const targetCallers = profData || [];

    // 2. Map real email addresses from invites and auth
    const emailMap = new Map<string, string>();

    // A. Query invites table (maps accepted_by -> email)
    const { data: invitesData } = await admin
      .from("invites")
      .select("accepted_by, email")
      .not("accepted_by", "is", null);

    if (invitesData) {
      for (const inv of invitesData) {
        if (inv.accepted_by && inv.email) {
          emailMap.set(inv.accepted_by, inv.email.toLowerCase().trim());
        }
      }
    }

    // B. For any caller not found in invites, fetch auth email directly via getUserById
    await Promise.allSettled(
      targetCallers.map(async (caller) => {
        if (!emailMap.has(caller.id)) {
          try {
            const { data: userData } = await admin.auth.admin.getUserById(caller.id);
            if (userData?.user?.email) {
              emailMap.set(caller.id, userData.user.email.toLowerCase().trim());
            }
          } catch {
            // Ignore individual fetch errors
          }
        }
      })
    );

    // 3. Compute time boundaries (IST: Asia/Kolkata, UTC+5:30)
    const now = new Date();
    let filterStartIso: string;
    let rangeLabel: string;

    if (rangeParam === "24h") {
      // Last 24 rolling hours
      const past24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      filterStartIso = past24h.toISOString();
      rangeLabel = "Last 24 Hours";
    } else {
      // Today in IST (Asia/Kolkata: UTC+5:30)
      const istOffsetMs = 5.5 * 60 * 60 * 1000;
      const istNow = new Date(now.getTime() + istOffsetMs);
      const istDateStr = istNow.toISOString().split("T")[0]; // YYYY-MM-DD
      // Start of day in IST converted to UTC ISO:
      const istStartUtc = new Date(new Date(`${istDateStr}T00:00:00.000Z`).getTime() - istOffsetMs);
      filterStartIso = istStartUtc.toISOString();
      rangeLabel = "Today (IST)";
    }

    // 4. Fetch calls in range
    const { data: callsData, error: callsErr } = await admin
      .from("calls")
      .select("id, caller_id, outcome, duration_seconds, called_at, callback_at, notes")
      .gte("called_at", filterStartIso);

    if (callsErr) {
      throw callsErr;
    }

    // 5. Fetch currently assigned active leads
    const { data: activeLeads, error: leadsErr } = await admin
      .from("leads")
      .select("id, assigned_to, status")
      .is("deleted_at", null)
      .not("assigned_to", "is", null)
      .not("status", "in", '("closed_won","closed_lost","dnc","not_interested")');

    if (leadsErr) {
      throw leadsErr;
    }

    // 6. Fetch count of leads in quarantine for navigation tab badge
    const { count: quarantineCount } = await admin
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("status", "not_interested")
      .is("deleted_at", null);

    // 7. Aggregate metrics per caller
    const callsList = callsData || [];
    const leadsList = activeLeads || [];

    // Real connect definition: Human was reached!
    // Interested, callback, gatekeeper, or spoken rejected. 'no_answer' is NEVER a connect!
    const humanConnectOutcomes = new Set([
      "interested",
      "callback",
      "gatekeeper",
      "dm_reached",
      "closed_won",
    ]);

    let totalDials = 0;
    let totalConnects = 0;
    let totalTalkTimeSeconds = 0;
    let totalInterested = 0;
    let totalCallbacks = 0;
    let totalNoAnswer = 0;
    let totalGatekeeper = 0;
    let totalRejected = 0;
    let totalDnc = 0;
    let activeCallersCount = 0;

    const callerStats = targetCallers.map((caller) => {
      const callerCalls = callsList.filter((c) => c.caller_id === caller.id);
      const dials = callerCalls.length;

      // Count human connects
      const connects = callerCalls.filter((c) => {
        return humanConnectOutcomes.has(c.outcome);
      }).length;

      // Outcomes breakdown
      const interested = callerCalls.filter((c) => c.outcome === "interested").length;
      const callback = callerCalls.filter((c) => c.outcome === "callback" || Boolean(c.callback_at)).length;
      const no_answer = callerCalls.filter((c) => c.outcome === "no_answer").length;
      const gatekeeper = callerCalls.filter((c) => c.outcome === "gatekeeper").length;
      const not_interested = callerCalls.filter((c) => c.outcome === "not_interested").length;
      const dnc = callerCalls.filter((c) => c.outcome === "dnc").length;

      const talkTimeSeconds = callerCalls.reduce(
        (acc, c) => acc + (Number(c.duration_seconds) || 0),
        0
      );

      const activeLeadsCount = leadsList.filter((l) => l.assigned_to === caller.id).length;

      const isOnline = Boolean(caller.active && caller.is_available);
      if (isOnline) {
        activeCallersCount += 1;
      }

      totalDials += dials;
      totalConnects += connects;
      totalTalkTimeSeconds += talkTimeSeconds;
      totalInterested += interested;
      totalCallbacks += callback;
      totalNoAnswer += no_answer;
      totalGatekeeper += gatekeeper;
      totalRejected += not_interested;
      totalDnc += dnc;

      return {
        id: caller.id,
        full_name: caller.full_name,
        email: emailMap.get(caller.id) || "Email unavailable",
        role: caller.role,
        active: Boolean(caller.active),
        is_available: Boolean(caller.is_available),
        is_online: isOnline,
        require_password_change: Boolean(caller.require_password_change),
        temp_password_issued_at: caller.temp_password_issued_at || null,
        dials_today: dials,
        connects_today: connects,
        connect_rate_percent: dials >= 10 ? Math.round((connects / dials) * 100) : null,
        interested_today: interested,
        callbacks_today: callback,
        talk_time_seconds: talkTimeSeconds,
        active_leads_count: activeLeadsCount,
        outcomes_breakdown: {
          interested,
          callback,
          no_answer,
          gatekeeper,
          not_interested,
          dnc,
        },
      };
    });

    return NextResponse.json({
      callers: callerStats,
      summary: {
        total_dials_today: totalDials,
        total_connects_today: totalConnects,
        total_talk_time_seconds: totalTalkTimeSeconds,
        total_pipeline_escalations: totalInterested,
        total_callbacks_today: totalCallbacks,
        total_rejections_today: totalRejected,
        total_no_answer_today: totalNoAnswer,
        active_callers: activeCallersCount,
        total_callers: targetCallers.length,
        // Only show connect rate percentage if sample size is sufficient (>= 20 dials)
        connect_rate_percent: totalDials >= 20 ? Math.round((totalConnects / totalDials) * 100) : null,
      },
      quarantine_count: quarantineCount || 0,
      range: rangeParam,
      range_label: rangeLabel,
      filter_start: filterStartIso,
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
