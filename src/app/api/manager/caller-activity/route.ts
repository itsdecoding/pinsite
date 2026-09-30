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

    // 3. Fetch all calls made by this caller today (or rolling 24h)
    const { data: calls, error: callsErr } = await admin
      .from("calls")
      .select("id, lead_id, outcome, duration_seconds, notes, called_at, callback_at")
      .eq("caller_id", callerId)
      .order("called_at", { ascending: false })
      .limit(100);

    if (callsErr) {
      throw callsErr;
    }

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

    // 4. Fetch active leads currently assigned to caller
    const { data: activeLeads, error: activeLeadsErr } = await admin
      .from("leads")
      .select("id, name, phone, niche, area, score, attempts_count, next_callback_at, last_called_at, status")
      .eq("assigned_to", callerId)
      .is("deleted_at", null)
      .not("status", "in", '("closed_won","closed_lost","dnc","not_interested")')
      .order("score", { ascending: false })
      .limit(100);

    if (activeLeadsErr) {
      throw activeLeadsErr;
    }

    // 5. Aggregate summary
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
        connects,
        connect_rate: totalDials >= 10 ? Math.round((connects / totalDials) * 100) : null,
        talk_time_seconds: totalTalkTime,
        active_queue_count: (activeLeads || []).length,
      },
      calls: callLogs,
      active_leads: activeLeads || [],
    });
  } catch (err: any) {
    console.error("Caller activity error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to retrieve caller activity" },
      { status: 500 }
    );
  }
}
