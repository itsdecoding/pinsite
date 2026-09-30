import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    // 1. Authenticate user session
    const serverSupabase = createServerClient();
    let {
      data: { user },
    } = await serverSupabase.auth.getUser();

    const admin = createAdminClient(supabaseUrl, supabaseServiceKey);

    if (!user) {
      const authHeader = req.headers.get("authorization");
      if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.replace("Bearer ", "").trim();
        const { data: jwtData } = await admin.auth.getUser(token);
        user = jwtData.user;
      }
    }

    if (!user) {
      return NextResponse.json({ error: "Unauthorized: Active session required" }, { status: 401 });
    }

    // 2. Verify manager/admin role
    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.role !== "manager" && profile?.role !== "admin") {
      return NextResponse.json(
        { error: "Forbidden: Only managers and admins can reassign leads" },
        { status: 403 }
      );
    }

    const { lead_id, caller_id, reason } = await req.json();

    if (!lead_id) {
      return NextResponse.json({ error: "Missing lead_id parameter" }, { status: 400 });
    }

    // 3. Update lead assignment (clearing quarantine attribution & metadata if rescued)
    const updateData: Record<string, any> = {
      assigned_to: caller_id || null,
      status: caller_id ? "assigned" : "unassigned",
      assigned_date: caller_id ? new Date().toISOString().split("T")[0] : null,
      updated_at: new Date().toISOString(),
      quarantined_at: null,
      disposal_scheduled_at: null,
      rejection_reason: null,
      rejected_by: null,
      cooldown_until: null,
    };

    const { error: updateError } = await admin
      .from("leads")
      .update(updateData)
      .eq("id", lead_id);

    if (updateError) throw updateError;

    // 4. Log in assignment history
    const historyReason = reason || (caller_id ? "manager_manual_reassign" : "manager_unassigned");
    await admin.from("assignment_history").insert({
      lead_id,
      to_caller_id: caller_id || null,
      assigned_by: user.id,
      reason: historyReason,
    });

    // 5. Notify the assigned caller if assigned
    if (caller_id) {
      await admin.from("notifications").insert({
        user_id: caller_id,
        type: "lead_assigned",
        title: "Lead Assigned",
        body: "A manager has assigned a new lead to your queue.",
        entity_type: "lead",
        entity_id: lead_id,
        link: "/queue",
      });
    }

    return NextResponse.json({
      success: true,
      lead_id,
      assigned_to: caller_id || null,
    });
  } catch (err: any) {
    console.error("Lead reassignment error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to reassign lead" },
      { status: 500 }
    );
  }
}
