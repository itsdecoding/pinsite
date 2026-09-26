import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { user_1, user_2 } = body;

    if (!user_1 || !user_2) {
      return NextResponse.json({ error: "Both user_1 and user_2 are required" }, { status: 400 });
    }

    const user_a = user_1 < user_2 ? user_1 : user_2;
    const user_b = user_1 < user_2 ? user_2 : user_1;

    // Check if thread exists
    const { data: existingThread } = await supabase
      .from("dm_threads")
      .select("id")
      .eq("user_a", user_a)
      .eq("user_b", user_b)
      .maybeSingle();

    if (existingThread) {
      return NextResponse.json({ thread_id: existingThread.id });
    }

    // Create thread
    const { data: newThread, error } = await supabase
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
