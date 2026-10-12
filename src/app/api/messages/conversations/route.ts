import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, getAuthenticatedUser } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized: Active session required" }, { status: 401 });
    }

    const { user } = auth;
    const admin = getAdminClient();

    // 1. Fetch all DM threads where authenticated user is user_a or user_b
    const { data: threads, error: threadsError } = await admin
      .from("dm_threads")
      .select("id, user_a, user_b, created_at")
      .or(`user_a.eq.${user.id},user_b.eq.${user.id}`);

    if (threadsError) throw threadsError;
    if (!threads || threads.length === 0) {
      return NextResponse.json({ conversations: [] });
    }

    // 2. Fetch partner profiles, unread counts, and recent messages in parallel batch
    const threadIds = threads.map((t) => t.id);
    const partnerIds = Array.from(
      new Set(threads.map((t) => (t.user_a === user.id ? t.user_b : t.user_a)))
    );

    const [
      { data: partnerProfiles, error: profilesError },
      { data: unreadRows },
      { data: recentMessages },
    ] = await Promise.all([
      admin
        .from("profiles")
        .select("id, full_name, role")
        .in("id", partnerIds),

      admin
        .from("dm_messages")
        .select("thread_id")
        .in("thread_id", threadIds)
        .neq("sender_id", user.id)
        .is("read_at", null)
        .is("deleted_at", null),

      admin
        .from("dm_messages")
        .select("id, thread_id, body, sender_id, created_at")
        .in("thread_id", threadIds)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(Math.max(100, threadIds.length * 10)),
    ]);

    if (profilesError) throw profilesError;

    // Fast in-memory mappings
    const profileMap = new Map<string, { id: string; full_name: string; role: string }>();
    partnerProfiles?.forEach((p) => {
      profileMap.set(p.id, p);
    });

    const unreadCountMap = new Map<string, number>();
    unreadRows?.forEach((row: any) => {
      unreadCountMap.set(row.thread_id, (unreadCountMap.get(row.thread_id) || 0) + 1);
    });

    const lastMessageMap = new Map<string, { id: string; body: string; sender_id: string; created_at: string }>();
    recentMessages?.forEach((m: any) => {
      if (!lastMessageMap.has(m.thread_id)) {
        lastMessageMap.set(m.thread_id, {
          id: m.id,
          body: m.body,
          sender_id: m.sender_id,
          created_at: m.created_at,
        });
      }
    });

    // Fallback for any thread whose last message was older than the top batch
    const missingThreadIds = threadIds.filter((id) => !lastMessageMap.has(id));
    if (missingThreadIds.length > 0) {
      await Promise.all(
        missingThreadIds.map(async (tId) => {
          const { data: singleLast } = await admin
            .from("dm_messages")
            .select("id, body, sender_id, created_at")
            .eq("thread_id", tId)
            .is("deleted_at", null)
            .order("created_at", { ascending: false })
            .limit(1);

          if (singleLast && singleLast.length > 0) {
            lastMessageMap.set(tId, singleLast[0]);
          }
        })
      );
    }

    // Assemble conversation objects
    const conversations = threads.map((thread) => {
      const partnerId = thread.user_a === user.id ? thread.user_b : thread.user_a;
      const partner = profileMap.get(partnerId) || {
        id: partnerId,
        full_name: "Team Member",
        role: "caller",
      };

      const lastMessage = lastMessageMap.get(thread.id) || null;
      const unreadCount = unreadCountMap.get(thread.id) || 0;

      return {
        id: thread.id,
        participant: partner,
        last_message: lastMessage,
        unread_count: unreadCount,
        updated_at: lastMessage?.created_at || thread.created_at,
      };
    });

    // Sort by most recently active conversation
    conversations.sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );

    return NextResponse.json({ conversations });
  } catch (err: any) {
    console.error("Error fetching conversations:", err);
    return NextResponse.json({ error: err.message || "Failed to fetch conversations" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized: Active session required" }, { status: 401 });
    }

    const { user } = auth;
    const admin = getAdminClient();
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const { thread_id } = body;

    if (!thread_id) {
      return NextResponse.json({ error: "thread_id is required" }, { status: 400 });
    }

    // Verify participation
    const { data: thread } = await admin
      .from("dm_threads")
      .select("user_a, user_b")
      .eq("id", thread_id)
      .maybeSingle();

    const currentUserIdLower = user.id.toLowerCase();
    const userALower = (thread?.user_a || "").toLowerCase();
    const userBLower = (thread?.user_b || "").toLowerCase();

    if (!thread || (userALower !== currentUserIdLower && userBLower !== currentUserIdLower)) {
      return NextResponse.json({ error: "Forbidden: Not a thread participant" }, { status: 403 });
    }

    // Mark messages as read
    const { error } = await admin
      .from("dm_messages")
      .update({ read_at: new Date().toISOString() })
      .eq("thread_id", thread_id)
      .neq("sender_id", user.id)
      .is("read_at", null);

    if (error) throw error;

    // Also mark in-app notifications for this DM conversation as read
    const partnerId = userALower === currentUserIdLower ? thread.user_b : thread.user_a;
    try {
      await admin
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .or(`link.eq./studio/comms?dm=${partnerId},link.eq./comms?dm=${partnerId}`)
        .is("read_at", null);
    } catch (notifErr) {
      console.warn("Failed to mark DM notifications as read:", notifErr);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("Error marking thread as read:", err);
    return NextResponse.json({ error: err.message || "Failed to update thread read status" }, { status: 500 });
  }
}
