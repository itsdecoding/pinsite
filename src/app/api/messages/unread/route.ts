import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { getAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const serverSupabase = createServerClient();
    const {
      data: { user },
    } = await serverSupabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ unread_count: 0 });
    }

    const admin = getAdminClient();

    // 1. Fetch user's DM threads
    const { data: threads } = await admin
      .from("dm_threads")
      .select("id")
      .or(`user_a.eq.${user.id},user_b.eq.${user.id}`);

    let unreadCount = 0;

    if (threads && threads.length > 0) {
      const threadIds = threads.map((t) => t.id);
      const { count: dmCount } = await admin
        .from("dm_messages")
        .select("id", { count: "exact", head: true })
        .in("thread_id", threadIds)
        .neq("sender_id", user.id)
        .is("read_at", null)
        .is("deleted_at", null);

      unreadCount += dmCount || 0;
    }

    // 2. Count unread chat @mentions in notifications table
    const { count: mentionCount } = await admin
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("type", "mention")
      .is("read_at", null);

    unreadCount += mentionCount || 0;

    return NextResponse.json({ unread_count: unreadCount });
  } catch (err: any) {
    console.error("Error fetching unread comms count:", err);
    return NextResponse.json({ unread_count: 0 });
  }
}
