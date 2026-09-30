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

    const admin = getAdminClient();

    // 1. Fetch all quarantined leads (status = 'not_interested' AND deleted_at IS NULL)
    const { data: quarantinedLeads, error: leadsErr } = await admin
      .from("leads")
      .select("id, name, phone, normalized_phone, niche, area, score, attempts_count, rejected_by, rejection_reason, quarantined_at, disposal_scheduled_at, created_at, updated_at")
      .eq("status", "not_interested")
      .is("deleted_at", null)
      .order("quarantined_at", { ascending: false });

    if (leadsErr) {
      throw leadsErr;
    }

    // 2. Fetch profiles to resolve rejected_by full_name and provide active caller roster
    const { data: profiles, error: profErr } = await admin
      .from("profiles")
      .select("id, full_name, role, is_available, active")
      .is("deleted_at", null);

    if (profErr) {
      throw profErr;
    }

    const profileMap = new Map<string, { id: string; full_name: string; role: string }>();
    const activeCallers: Array<{ id: string; full_name: string; role: string; is_available: boolean; active: boolean }> = [];

    (profiles || []).forEach((p) => {
      profileMap.set(p.id, { id: p.id, full_name: p.full_name, role: p.role });
      if (p.active && (p.role === "caller" || p.role === "admin" || p.role === "manager")) {
        activeCallers.push(p);
      }
    });

    // 3. Map leads with disposing caller name
    const enrichedLeads = (quarantinedLeads || []).map((lead) => {
      const caller = lead.rejected_by ? profileMap.get(lead.rejected_by) : null;
      return {
        ...lead,
        disposing_caller: caller ? caller.full_name : lead.rejected_by ? "Former Team Member" : "System Auto-Cadence",
        disposing_caller_id: lead.rejected_by || null,
      };
    });

    return NextResponse.json({
      leads: enrichedLeads,
      active_callers: activeCallers,
      count: enrichedLeads.length,
    });
  } catch (err: any) {
    console.error("Fetch quarantined leads error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to load quarantined leads" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const authResult = await verifyManagerSession(req);
    if ("error" in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { user } = authResult;
    const admin = getAdminClient();
    const body = await req.json();
    const { lead_id, choice, target_caller_id } = body;

    if (!lead_id) {
      return NextResponse.json({ error: "Missing lead_id parameter" }, { status: 400 });
    }

    // 1. Fetch current lead
    const { data: lead, error: fetchErr } = await admin
      .from("leads")
      .select("id, rejected_by, name")
      .eq("id", lead_id)
      .maybeSingle();

    if (fetchErr || !lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    // 2. Resolve destination caller
    let resolvedCallerId: string | null = null;
    let resolvedStatus: "assigned" | "unassigned" = "unassigned";

    if (choice === "original") {
      resolvedCallerId = lead.rejected_by || null;
      resolvedStatus = resolvedCallerId ? "assigned" : "unassigned";
    } else if (choice === "unassigned") {
      resolvedCallerId = null;
      resolvedStatus = "unassigned";
    } else if (choice === "specific") {
      resolvedCallerId = target_caller_id || null;
      resolvedStatus = resolvedCallerId ? "assigned" : "unassigned";
    } else {
      // Fallback if caller_id is passed directly
      resolvedCallerId = target_caller_id || null;
      resolvedStatus = resolvedCallerId ? "assigned" : "unassigned";
    }

    const todayDate = new Date().toISOString().split("T")[0];
    const nowIso = new Date().toISOString();

    // 3. Atomically update lead and clear quarantine attribution
    const { error: updateErr } = await admin
      .from("leads")
      .update({
        assigned_to: resolvedCallerId,
        status: resolvedStatus,
        assigned_date: resolvedCallerId ? todayDate : null,
        quarantined_at: null,
        disposal_scheduled_at: null,
        rejection_reason: null,
        rejected_by: null,
        cooldown_until: null,
        updated_at: nowIso,
      })
      .eq("id", lead_id);

    if (updateErr) {
      throw updateErr;
    }

    // 4. Log rescue in assignment history
    await admin.from("assignment_history").insert({
      lead_id,
      to_caller_id: resolvedCallerId,
      assigned_by: user.id,
      reason: "quarantine_rescue",
    });

    // 5. Notify assigned caller if routed to a specific agent
    if (resolvedCallerId) {
      await admin.from("notifications").insert({
        user_id: resolvedCallerId,
        type: "lead_assigned",
        title: "Rescued Lead Assigned",
        body: `A manager rescued "${lead.name}" from quarantine and assigned it to your dial queue.`,
        entity_type: "lead",
        entity_id: lead_id,
        link: "/queue",
      });
    }

    return NextResponse.json({
      success: true,
      lead_id,
      assigned_to: resolvedCallerId,
      status: resolvedStatus,
      message: "Lead successfully rescued from quarantine",
    });
  } catch (err: any) {
    console.error("Rescue quarantined lead error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to rescue lead" },
      { status: 500 }
    );
  }
}
