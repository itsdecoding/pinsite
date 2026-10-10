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

    // 2. Restrict to managers and admins (Callers cannot trigger distribution)
    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (profile?.role !== "manager" && profile?.role !== "admin") {
      return NextResponse.json(
        { error: "Forbidden: Callers cannot trigger lead distribution. Only managers and admins can distribute leads." },
        { status: 403 }
      );
    }

    // 3. Execute depth-aware assign_daily_leads (default cap 100)
    const { data: rpcData, error: rpcError } = await admin.rpc("assign_daily_leads", { p_target_cap: 100 });
    if (rpcError) throw rpcError;

    // 3. Return updated counts
    const { count: uncalledCount } = await admin
      .from("leads")
      .select("*", { count: "exact", head: true })
      .eq("assigned_to", user.id)
      .is("deleted_at", null)
      .in("status", ["assigned", "callback"]);

    return NextResponse.json({
      success: true,
      message: "Daily lead top-up executed successfully",
      assigned_count: uncalledCount || 0,
    });
  } catch (err: any) {
    console.error("Error claiming leads:", err);
    return NextResponse.json(
      { error: err.message || "Failed to assign leads" },
      { status: 500 }
    );
  }
}
