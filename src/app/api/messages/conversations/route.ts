import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createAdminClient(supabaseUrl, supabaseServiceKey);
}

async function getAuthenticatedUser(req: NextRequest) {
  // 1. Check cookies session
  const serverSupabase = createServerClient();
  const {
    data: { user },
  } = await serverSupabase.auth.getUser();

  if (user) {
    const admin = getAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    return { user, role: profile?.role || "caller" };
  }

  // 2. Check Bearer token
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.replace("Bearer ", "").trim();
    const admin = getAdminClient();
    const { data: jwtData } = await admin.auth.getUser(token);
    if (jwtData?.user) {
      const { data: profile } = await admin
        .from("profiles")
        .select("role")
        .eq("id", jwtData.user.id)
        .maybeSingle();

      return { user: jwtData.user, role: profile?.role || "caller" };
    }
  }

  return null;
}

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

    // 2. Determine all distinct partner IDs
    const partnerIds = Array.from(
      new Set(
        threads.map((t) => (t.user_a === user.id ? t.user_b : t.user_a))
      )
    );

    // 3. Fetch partner profiles
    const { data: partnerProfiles, error: profilesError } = await admin
      .from("profiles")
      .select("id, full_name, role")
      .in("id", partnerIds);

    if (profilesError) throw profilesError;

    const profileMap = new Map<string, { id: string; full_name: string; role: string }>();
    partnerProfiles?.forEach((p) => {
      profileMap.set(p.id, p);
    });

    // 4. For each thread, fetch last message and unread count
    const conversationPromises = threads.map(async (thread) => {
      const partnerId = thread.user_a === user.id ? thread.user_b : thread.user_a;
      const partner = profileMap.get(partnerId) || {
        id: partnerId,
        full_name: "Team Member",
        role: "caller",
      };

      // Last message
      const { data: lastMessages } = await admin
        .from("dm_messages")
        .select("id, body, sender_id, created_at")
        .eq("thread_id", thread.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1);

      const lastMessage = lastMessages && lastMessages.length > 0 ? lastMessages[0] : null;

      // Unread count (messages sent by partner that haven't been read)
      const { count: unreadCount } = await admin
        .from("dm_messages")
        .select("id", { count: "exact", head: true })
        .eq("thread_id", thread.id)
        .neq("sender_id", user.id)
        .is("read_at", null)
        .is("deleted_at", null);

      return {
        id: thread.id,
        participant: partner,
        last_message: lastMessage,
        unread_count: unreadCount || 0,
        updated_at: lastMessage?.created_at || thread.created_at,
      };
    });

    const conversations = await Promise.all(conversationPromises);

    // 5. Sort by most recently active conversation
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
