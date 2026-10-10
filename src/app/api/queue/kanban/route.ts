import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createAdminClient(supabaseUrl, supabaseServiceKey);
}

async function verifyAuthSession(req: NextRequest) {
  const serverSupabase = createServerClient();
  let {
    data: { user },
  } = await serverSupabase.auth.getUser();

  const admin = getAdminClient();

  if (!user) {
    const authHeader = req.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.replace("Bearer ", "").trim();
      const { data: jwtData } = await admin.auth.getUser(token);
      user = jwtData.user;
    }
  }

  if (!user) {
    return { error: "Unauthorized: Active session required", status: 401 };
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("id, role, full_name")
    .eq("id", user.id)
    .maybeSingle();

  return {
    user,
    role: profile?.role || "caller",
    fullName: profile?.full_name || "Team Member",
  };
}

export async function GET(req: NextRequest) {
  try {
    const authResult = await verifyAuthSession(req);
    if ("error" in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { searchParams } = new URL(req.url);
    const filterNiche = searchParams.get("niche")?.trim();
    const filterArea = searchParams.get("area")?.trim();
    const filterCaller = searchParams.get("caller_id")?.trim();
    const searchQuery = searchParams.get("search")?.trim();
    const targetCap = Number(searchParams.get("target_cap")) || 100;

    const admin = getAdminClient();

    // Calculate IST start of day for today's dial metrics
    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(Date.now() + istOffsetMs);
    const istDateStr = istNow.toISOString().split("T")[0]; // YYYY-MM-DD
    const istStartUtc = new Date(new Date(`${istDateStr}T00:00:00.000Z`).getTime() - istOffsetMs).toISOString();

    // 1. Fetch unassigned leads (Pool)
    let unassignedQuery = admin
      .from("leads")
      .select("id, name, phone, normalized_phone, website, has_website, address, niche, area, score, status, attempts_count, created_at")
      .eq("status", "unassigned")
      .is("assigned_to", null)
      .is("deleted_at", null)
      .eq("dnc_flag", false);

    if (filterNiche && filterNiche !== "all") {
      unassignedQuery = unassignedQuery.ilike("niche", `%${filterNiche}%`);
    }
    if (filterArea && filterArea !== "all") {
      unassignedQuery = unassignedQuery.ilike("area", `%${filterArea}%`);
    }
    if (searchQuery) {
      unassignedQuery = unassignedQuery.or(`name.ilike.%${searchQuery}%,phone.ilike.%${searchQuery}%,area.ilike.%${searchQuery}%`);
    }

    // Count of unassigned pool (respects filters if provided)
    let unassignedCountQuery = admin
      .from("leads")
      .select("*", { count: "exact", head: true })
      .eq("status", "unassigned")
      .is("assigned_to", null)
      .is("deleted_at", null)
      .eq("dnc_flag", false);

    if (filterNiche && filterNiche !== "all") {
      unassignedCountQuery = unassignedCountQuery.ilike("niche", `%${filterNiche}%`);
    }
    if (filterArea && filterArea !== "all") {
      unassignedCountQuery = unassignedCountQuery.ilike("area", `%${filterArea}%`);
    }
    if (searchQuery) {
      unassignedCountQuery = unassignedCountQuery.or(`name.ilike.%${searchQuery}%,phone.ilike.%${searchQuery}%,area.ilike.%${searchQuery}%`);
    }

    const { count: unassignedCount } = await unassignedCountQuery;

    const { data: unassignedLeads, error: unassignedErr } = await unassignedQuery
      .order("score", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(60);

    if (unassignedErr) throw unassignedErr;

    // 2. Fetch Interested Prospects (Hot leads / Deals)
    let interestedQuery = admin
      .from("leads")
      .select("id, name, phone, normalized_phone, website, has_website, address, niche, area, score, status, assigned_to, updated_at, last_called_at, profiles:assigned_to(full_name)")
      .eq("status", "interested")
      .is("deleted_at", null);

    if (filterNiche && filterNiche !== "all") {
      interestedQuery = interestedQuery.ilike("niche", `%${filterNiche}%`);
    }
    if (filterArea && filterArea !== "all") {
      interestedQuery = interestedQuery.ilike("area", `%${filterArea}%`);
    }
    if (searchQuery) {
      interestedQuery = interestedQuery.or(`name.ilike.%${searchQuery}%,phone.ilike.%${searchQuery}%,area.ilike.%${searchQuery}%`);
    }

    let interestedCountQuery = admin
      .from("leads")
      .select("*", { count: "exact", head: true })
      .eq("status", "interested")
      .is("deleted_at", null);

    if (filterNiche && filterNiche !== "all") {
      interestedCountQuery = interestedCountQuery.ilike("niche", `%${filterNiche}%`);
    }
    if (filterArea && filterArea !== "all") {
      interestedCountQuery = interestedCountQuery.ilike("area", `%${filterArea}%`);
    }
    if (searchQuery) {
      interestedCountQuery = interestedCountQuery.or(`name.ilike.%${searchQuery}%,phone.ilike.%${searchQuery}%,area.ilike.%${searchQuery}%`);
    }

    const { count: interestedCount } = await interestedCountQuery;

    const { data: interestedLeads, error: interestedErr } = await interestedQuery
      .order("updated_at", { ascending: false })
      .limit(60);

    if (interestedErr) throw interestedErr;

    // 3. Fetch active callers
    let callersQuery = admin
      .from("profiles")
      .select("id, full_name, role, active, is_available")
      .eq("role", "caller")
      .eq("active", true)
      .is("deleted_at", null)
      .order("full_name", { ascending: true });

    if (filterCaller && filterCaller !== "all") {
      callersQuery = callersQuery.eq("id", filterCaller);
    }

    const { data: callers, error: callersErr } = await callersQuery;
    if (callersErr) throw callersErr;

    // 4. Batch fetch caller leads counts and today's dials in single roundtrips
    const callerIds = (callers || []).map((c) => c.id);

    // Dials today count per caller
    const dialsTodayMap = new Map<string, number>();
    const callerActiveCountMap = new Map<string, number>();

    if (callerIds.length > 0) {
      const [callsRes, activeLeadsRes] = await Promise.all([
        admin
          .from("calls")
          .select("caller_id")
          .in("caller_id", callerIds)
          .gte("called_at", istStartUtc),
        admin
          .from("leads")
          .select("assigned_to")
          .in("assigned_to", callerIds)
          .is("deleted_at", null)
          .not("status", "in", '("closed_won","closed_lost","dnc","not_interested","interested")'),
      ]);

      for (const call of callsRes.data || []) {
        dialsTodayMap.set(call.caller_id, (dialsTodayMap.get(call.caller_id) || 0) + 1);
      }

      for (const lead of activeLeadsRes.data || []) {
        if (lead.assigned_to) {
          callerActiveCountMap.set(lead.assigned_to, (callerActiveCountMap.get(lead.assigned_to) || 0) + 1);
        }
      }
    }

    // Active leads per caller
    const callerColumns = await Promise.all(
      (callers || []).map(async (caller) => {
        const callerTotalActive = callerActiveCountMap.get(caller.id) || 0;

        let callerLeadsQuery = admin
          .from("leads")
          .select("id, name, phone, normalized_phone, website, has_website, address, niche, area, score, status, attempts_count, next_callback_at, last_called_at, cooldown_until, assigned_to")
          .eq("assigned_to", caller.id)
          .is("deleted_at", null)
          .not("status", "in", '("closed_won","closed_lost","dnc","not_interested","interested")');

        if (filterNiche && filterNiche !== "all") {
          callerLeadsQuery = callerLeadsQuery.ilike("niche", `%${filterNiche}%`);
        }
        if (filterArea && filterArea !== "all") {
          callerLeadsQuery = callerLeadsQuery.ilike("area", `%${filterArea}%`);
        }
        if (searchQuery) {
          callerLeadsQuery = callerLeadsQuery.or(`name.ilike.%${searchQuery}%,phone.ilike.%${searchQuery}%,area.ilike.%${searchQuery}%`);
        }

        const { data: callerLeads } = await callerLeadsQuery
          .order("next_callback_at", { ascending: true, nullsFirst: false })
          .order("score", { ascending: false })
          .limit(50);

        return {
          id: caller.id,
          fullName: caller.full_name,
          isOnline: Boolean(caller.active && caller.is_available !== false),
          activeCount: callerTotalActive || 0,
          dialsToday: dialsTodayMap.get(caller.id) || 0,
          targetCap,
          fillPercentage: Math.min(100, Math.round(((callerTotalActive || 0) / targetCap) * 100)),
          leads: (callerLeads || []).map((lead) => ({
            ...lead,
            profiles: { full_name: caller.full_name },
          })),
        };
      })
    );

    const totalAssignedAcrossCallers = callerColumns.reduce(
      (acc, c) => acc + c.activeCount,
      0
    );

    return NextResponse.json({
      success: true,
      userRole: authResult.role,
      currentUserId: authResult.user.id,
      summary: {
        unassignedPoolCount: unassignedCount || 0,
        interestedProspectsCount: interestedCount || 0,
        totalAssignedCount: totalAssignedAcrossCallers,
        totalCallersCount: callerColumns.length,
        targetCap,
      },
      unassignedPool: {
        totalCount: unassignedCount || 0,
        leads: unassignedLeads || [],
      },
      interestedProspects: {
        totalCount: interestedCount || 0,
        leads: interestedLeads || [],
      },
      callerColumns,
    });
  } catch (err: any) {
    console.error("Queue Kanban API error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to load Kanban board data" },
      { status: 500 }
    );
  }
}
