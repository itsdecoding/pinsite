import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const admin = createAdminClient(supabaseUrl, supabaseServiceKey);

    // 1. Authenticate user
    const serverSupabase = createServerClient();
    let {
      data: { user },
    } = await serverSupabase.auth.getUser();

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

    const body = await req.json();
    const { user_1, user_2 } = body;

    if (!user_1 || !user_2) {
      return NextResponse.json({ error: "Both user_1 and user_2 are required" }, { status: 400 });
    }

    // Check that caller is one of the thread participants
    if (user.id !== user_1 && user.id !== user_2) {
      const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
      if (profile?.role !== "admin") {
        return NextResponse.json({ error: "Forbidden: You cannot open a thread for other users" }, { status: 403 });
      }
    }

    const user_a = user_1 < user_2 ? user_1 : user_2;
    const user_b = user_1 < user_2 ? user_2 : user_1;

    // Check if thread exists
    const { data: existingThread } = await admin
      .from("dm_threads")
      .select("id")
      .eq("user_a", user_a)
      .eq("user_b", user_b)
      .maybeSingle();

    if (existingThread) {
      return NextResponse.json({ thread_id: existingThread.id });
    }

    // Create thread
    const { data: newThread, error } = await admin
      .from("dm_threads")
      .insert({ user_a, user_b })
      .select("id")
      .single();

    if (error) throw error;
    return NextResponse.json({ thread_id: newThread.id }, { status: 201 });
  } catch (err: any) {
    console.error("Error creating/getting DM thread:", err);
    return NextResponse.json({ error: err.message || "Failed to resolve DM thread" }, { status: 500 });
  }
}
