import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, verifyManagerSession } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const authResult = await verifyManagerSession(req);
    if ("error" in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const admin = getAdminClient();
    const { searchParams } = new URL(req.url);
    const rangeParam = searchParams.get("range") || "all"; // "all" | "30d" | "7d" | "today"

    // 1. Calculate time filter boundary
    const now = new Date();
    let filterStartIso: string | null = null;
    let rangeLabel = "All Time";

    if (rangeParam === "today") {
      const istOffsetMs = 5.5 * 60 * 60 * 1000;
      const istNow = new Date(now.getTime() + istOffsetMs);
      const istDateStr = istNow.toISOString().split("T")[0];
      const istStartUtc = new Date(new Date(`${istDateStr}T00:00:00.000Z`).getTime() - istOffsetMs);
      filterStartIso = istStartUtc.toISOString();
      rangeLabel = "Today (IST)";
    } else if (rangeParam === "7d") {
      filterStartIso = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      rangeLabel = "Last 7 Days";
    } else if (rangeParam === "30d") {
      filterStartIso = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      rangeLabel = "Last 30 Days";
    }

    // 2. Query data in parallel: profiles, calls, interested leads, all leads
    let callsQuery = admin
      .from("calls")
      .select("id, lead_id, caller_id, outcome, duration_seconds, called_at");

    if (filterStartIso) {
      callsQuery = callsQuery.gte("called_at", filterStartIso);
    }

    const [
      { data: profiles, error: profErr },
      { data: calls, error: callsErr },
      { data: allCallsHistory, error: allCallsErr },
      { count: allTimeCallsCount },
      { data: interestedLeads, error: intLeadsErr },
      { data: allLeads, error: allLeadsErr },
    ] = await Promise.all([
      admin
        .from("profiles")
        .select("id, full_name, role, active")
        .is("deleted_at", null)
        .neq("id", "00000000-0000-0000-0000-000000000001"), // exclude Pinsite Bot
      callsQuery,
      admin.from("calls").select("outcome, called_at"),
      admin.from("calls").select("id", { count: "exact", head: true }),
      admin
        .from("leads")
        .select("id, name, phone, niche, area, score, status, escalated_at, updated_at, assigned_to")
        .in("status", ["interested", "closed_won"])
        .is("deleted_at", null)
        .order("escalated_at", { ascending: false }),
      admin
        .from("leads")
        .select("id, status, niche, attempts_count")
        .is("deleted_at", null),
    ]);

    if (profErr) throw profErr;
    if (callsErr) throw callsErr;
    if (allCallsErr) throw allCallsErr;
    if (intLeadsErr) throw intLeadsErr;
    if (allLeadsErr) throw allLeadsErr;

    const callerMap = new Map<string, { id: string; name: string; role: string; active: boolean }>();
    for (const p of profiles || []) {
      callerMap.set(p.id, {
        id: p.id,
        name: p.full_name || "Unknown",
        role: p.role,
        active: p.active,
      });
    }

    // 3. Aggregate metrics per caller for the Scatter Plot
    const humanConnectSet = new Set(["interested", "callback", "gatekeeper", "dm_reached", "closed_won"]);
    const callerStatsMap = new Map<string, {
      id: string;
      name: string;
      role: string;
      active: boolean;
      total_dials: number;
      connects: number;
      interested: number;
      closed_won: number;
      callbacks: number;
      not_interested: number;
      dnc: number;
      no_answer: number;
      total_talk_seconds: number;
    }>();

    // Initialize map for all callers
    for (const p of profiles || []) {
      callerStatsMap.set(p.id, {
        id: p.id,
        name: p.full_name || "Unknown",
        role: p.role,
        active: p.active,
        total_dials: 0,
        connects: 0,
        interested: 0,
        closed_won: 0,
        callbacks: 0,
        not_interested: 0,
        dnc: 0,
        no_answer: 0,
        total_talk_seconds: 0,
      });
    }

    for (const c of calls || []) {
      let stat = callerStatsMap.get(c.caller_id);
      if (!stat) {
        stat = {
          id: c.caller_id,
          name: callerMap.get(c.caller_id)?.name || "Unknown Caller",
          role: "caller",
          active: true,
          total_dials: 0,
          connects: 0,
          interested: 0,
          closed_won: 0,
          callbacks: 0,
          not_interested: 0,
          dnc: 0,
          no_answer: 0,
          total_talk_seconds: 0,
        };
        callerStatsMap.set(c.caller_id, stat);
      }

      stat.total_dials += 1;
      stat.total_talk_seconds += c.duration_seconds || 0;

      if (humanConnectSet.has(c.outcome)) {
        stat.connects += 1;
      }

      if (c.outcome === "interested") stat.interested += 1;
      else if (c.outcome === "closed_won") stat.closed_won += 1;
      else if (c.outcome === "callback") stat.callbacks += 1;
      else if (c.outcome === "not_interested") stat.not_interested += 1;
      else if (c.outcome === "dnc") stat.dnc += 1;
      else if (c.outcome === "no_answer") stat.no_answer += 1;
    }

    // Format scatter plot points
    const callerPerformance = Array.from(callerStatsMap.values())
      .filter((c) => c.total_dials > 0 || c.role === "caller")
      .map((c) => {
        const positiveCount = c.interested + c.closed_won;
        const closeRate = c.total_dials > 0 ? (positiveCount / c.total_dials) * 100 : 0;
        const connectRate = c.total_dials > 0 ? (c.connects / c.total_dials) * 100 : 0;

        return {
          id: c.id,
          name: c.name,
          role: c.role,
          active: c.active,
          total_dials: c.total_dials,
          connects: c.connects,
          interested: c.interested,
          closed_won: c.closed_won,
          close_rate: Number(closeRate.toFixed(1)),
          connect_rate: Number(connectRate.toFixed(1)),
          avg_talk_seconds: c.connects > 0 ? Math.round(c.total_talk_seconds / c.connects) : 0,
        };
      })
      .sort((a, b) => b.total_dials - a.total_dials);

    // Standard high-ticket service ticket value for dental clients (₹35,000 / deal base, ₹45,000 for full redesign + SEO)
    const TICKET_SIZE_INR = 35000;

    // 4. Format Interested Prospects Sneak Peek with Deal Estimates & True Lead Score
    const sneakPeekLeads = (interestedLeads || []).map((l) => {
      // Dynamic package estimation based on clinic scale
      const isHighValue = /aesthetic|implant|smile|orthodontic|hospital|centre|center/i.test(l.name);
      const estValue = l.status === "closed_won" ? 50000 : isHighValue ? 45000 : 35000;

      return {
        id: l.id,
        name: l.name,
        phone: l.phone,
        niche: l.niche || "Dentist",
        area: l.area || "Pune",
        score: typeof l.score === "number" && !isNaN(l.score) ? l.score : 88,
        status: l.status,
        escalated_at: l.escalated_at || l.updated_at,
        caller_name: l.assigned_to ? callerMap.get(l.assigned_to)?.name || "Unassigned" : "Unassigned",
        caller_id: l.assigned_to,
        estimated_value_inr: estValue,
      };
    });

    // 5. Agency Revenue & Pipeline Snapshot
    const warmInPlayCount = sneakPeekLeads.filter((l) => l.status === "interested").length;
    const closedWonCount = sneakPeekLeads.filter((l) => l.status === "closed_won").length;
    const totalDialsInRange = calls?.length || 0;
    const totalPositive = (calls || []).filter((c) => c.outcome === "interested" || c.outcome === "closed_won").length;
    const contactToInterestedRate = totalDialsInRange > 0 ? Number(((totalPositive / totalDialsInRange) * 100).toFixed(1)) : 0;

    const estimatedPipelineValInr = sneakPeekLeads
      .filter((l) => l.status === "interested")
      .reduce((sum, l) => sum + l.estimated_value_inr, 0);
    const closedWonRevenueInr = sneakPeekLeads
      .filter((l) => l.status === "closed_won")
      .reduce((sum, l) => sum + l.estimated_value_inr, 0);

    // 6. Niche Quality Breakdown
    const nicheMap = new Map<string, { niche: string; total_leads: number; dials: number; interested: number }>();
    for (const l of allLeads || []) {
      const niche = l.niche || "Dentist";
      let nStat = nicheMap.get(niche);
      if (!nStat) {
        nStat = { niche, total_leads: 0, dials: 0, interested: 0 };
        nicheMap.set(niche, nStat);
      }
      nStat.total_leads += 1;
      if (l.attempts_count && l.attempts_count > 0) nStat.dials += l.attempts_count;
      if (l.status === "interested" || l.status === "closed_won") nStat.interested += 1;
    }

    const nicheBreakdown = Array.from(nicheMap.values())
      .map((n) => ({
        ...n,
        close_rate: n.dials > 0 ? Number(((n.interested / n.dials) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.total_leads - a.total_leads);

    // 7. Complete Funnel Breakdown (Leads -> Dials -> No Answer -> Connected -> Rejected/Callbacks -> Warm Interested -> Won)
    const totalLeadsCount = allLeads?.length || 0;
    const dialedLeadsCount = (allLeads || []).filter((l) => (l.attempts_count || 0) > 0).length;
    const totalDialsCount = calls?.length || 0;
    const noAnswerCount = (calls || []).filter((c) => c.outcome === "no_answer").length;
    const connectedCount = (calls || []).filter((c) => humanConnectSet.has(c.outcome)).length;
    const rejectedCount = (calls || []).filter((c) => c.outcome === "not_interested" || c.outcome === "dnc").length;
    const callbacksCount = (calls || []).filter((c) => c.outcome === "callback").length;

    const funnel = {
      total_leads: totalLeadsCount,
      dialed: dialedLeadsCount,
      total_dials: totalDialsCount,
      no_answer: noAnswerCount,
      connected: connectedCount,
      rejected: rejectedCount,
      callbacks: callbacksCount,
      interested: warmInPlayCount,
      closed_won: closedWonCount,
    };

    // 8. Weekly Trend (Last 4 Weeks Momentum)
    const msPerDay = 24 * 60 * 60 * 1000;
    const nowTime = now.getTime();
    const weeklyTrend = [3, 2, 1, 0].map((weeksAgo) => {
      const startMs = nowTime - (weeksAgo + 1) * 7 * msPerDay;
      const endMs = nowTime - weeksAgo * 7 * msPerDay;
      const startIso = new Date(startMs).toISOString();
      const endIso = new Date(endMs).toISOString();

      const weekCalls = (allCallsHistory || []).filter(
        (c) => c.called_at >= startIso && c.called_at <= endIso
      );

      const dials = weekCalls.length;
      const connects = weekCalls.filter((c) => humanConnectSet.has(c.outcome)).length;
      const positive = weekCalls.filter((c) => c.outcome === "interested" || c.outcome === "closed_won").length;

      const startDate = new Date(startMs);
      const endDate = new Date(endMs);
      const label = weeksAgo === 0 ? "This Week" : `W-${weeksAgo}`;
      const dateRangeStr = `${startDate.toLocaleDateString("en-IN", { month: "short", day: "numeric" })} - ${endDate.toLocaleDateString("en-IN", { month: "short", day: "numeric" })}`;

      return {
        label,
        date_range: dateRangeStr,
        dials,
        connects,
        interested: positive,
      };
    });

    return NextResponse.json({
      range: rangeParam,
      range_label: rangeLabel,
      snapshot: {
        warm_in_play: warmInPlayCount,
        closed_won: closedWonCount,
        closed_revenue_inr: closedWonRevenueInr,
        estimated_pipeline_inr: estimatedPipelineValInr,
        fleet_dials_in_range: totalDialsInRange,
        all_time_fleet_dials: allTimeCallsCount || totalDialsInRange,
        contact_to_interested_rate: contactToInterestedRate,
        agency_close_rate: contactToInterestedRate, // backward compat
      },
      interested_prospects: sneakPeekLeads,
      caller_performance: callerPerformance,
      niche_breakdown: nicheBreakdown,
      funnel,
      weekly_trend: weeklyTrend,
    });
  } catch (err: any) {
    console.error("Dashboard insights error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to calculate dashboard insights" },
      { status: 500 }
    );
  }
}
