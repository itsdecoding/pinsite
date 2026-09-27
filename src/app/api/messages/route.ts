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

    const { user, role } = auth;
    const admin = getAdminClient();
    const { searchParams } = new URL(req.url);
    const channelId = searchParams.get("channel_id");
    const threadId = searchParams.get("thread_id");

    if (threadId) {
      // Verify user is a participant of this DM thread or is admin
      const { data: thread } = await admin
        .from("dm_threads")
        .select("user_a, user_b")
        .eq("id", threadId)
        .maybeSingle();

      if (!thread) {
        return NextResponse.json({ error: "Thread not found" }, { status: 404 });
      }

      if (thread.user_a !== user.id && thread.user_b !== user.id && role !== "admin") {
        return NextResponse.json({ error: "Forbidden: Not a participant in this conversation" }, { status: 403 });
      }

      const { data, error } = await admin
        .from("dm_messages")
        .select(`
          id,
          sender_id,
          body,
          created_at,
          edited_at,
          deleted_at,
          profiles:sender_id (full_name, role)
        `)
        .eq("thread_id", threadId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return NextResponse.json({ messages: data || [] });
    } else if (channelId) {
      // Check if channel is private (e.g. #management)
      const { data: channel } = await admin
        .from("channels")
        .select("is_private, name")
        .eq("id", channelId)
        .maybeSingle();

      if (channel?.is_private && role !== "admin" && role !== "manager") {
        return NextResponse.json({ error: "Forbidden: Restricted management channel" }, { status: 403 });
      }

      const { data, error } = await admin
        .from("messages")
        .select(`
          id,
          sender_id,
          body,
          created_at,
          edited_at,
          deleted_at,
          profiles:sender_id (full_name, role)
        `)
        .eq("channel_id", channelId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return NextResponse.json({ messages: data || [] });
    } else {
      return NextResponse.json({ error: "Missing channel_id or thread_id parameter" }, { status: 400 });
    }
  } catch (err: any) {
    console.error("Failed to fetch messages:", err);
    return NextResponse.json({ error: err.message || "Failed to fetch messages" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized: Active session required" }, { status: 401 });
    }

    const { user, role } = auth;
    const admin = getAdminClient();
    const body = await req.json();
    const { channel_id, thread_id, body: messageBody, is_dm } = body;

    if (!messageBody || !messageBody.trim()) {
      return NextResponse.json({ error: "Message body is required" }, { status: 400 });
    }

    // Sender ID is strictly enforced as the authenticated user's ID
    const senderId = user.id;

    if (is_dm || thread_id) {
      if (!thread_id) {
        return NextResponse.json({ error: "thread_id is required for DMs" }, { status: 400 });
      }

      // Verify user is in this thread
      const { data: thread } = await admin
        .from("dm_threads")
        .select("user_a, user_b")
        .eq("id", thread_id)
        .maybeSingle();

      if (!thread || (thread.user_a !== user.id && thread.user_b !== user.id && role !== "admin")) {
        return NextResponse.json({ error: "Forbidden: Not a participant in this conversation" }, { status: 403 });
      }

      const { data: newDm, error: dmError } = await admin
        .from("dm_messages")
        .insert({
          thread_id,
          sender_id: senderId,
          body: messageBody.trim(),
        })
        .select(`
          id,
          sender_id,
          body,
          created_at,
          edited_at,
          deleted_at,
          profiles:sender_id (full_name, role)
        `)
        .single();

      if (dmError) throw dmError;
      return NextResponse.json({ message: newDm }, { status: 201 });
    } else {
      if (!channel_id) {
        return NextResponse.json({ error: "channel_id is required for channel messages" }, { status: 400 });
      }

      // If channel is private, check role
      const { data: channel } = await admin
        .from("channels")
        .select("is_private")
        .eq("id", channel_id)
        .maybeSingle();

      if (channel?.is_private && role !== "admin" && role !== "manager") {
        return NextResponse.json({ error: "Forbidden: Restricted management channel" }, { status: 403 });
      }

      const { data: newMsg, error: msgError } = await admin
        .from("messages")
        .insert({
          channel_id,
          sender_id: senderId,
          body: messageBody.trim(),
        })
        .select(`
          id,
          sender_id,
          body,
          created_at,
          edited_at,
          deleted_at,
          profiles:sender_id (full_name, role)
        `)
        .single();

      if (msgError) throw msgError;
      return NextResponse.json({ message: newMsg }, { status: 201 });
    }
  } catch (err: any) {
    console.error("Failed to dispatch message:", err);
    return NextResponse.json({ error: err.message || "Failed to dispatch message" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized: Active session required" }, { status: 401 });
    }

    const { user, role } = auth;
    const admin = getAdminClient();
    const body = await req.json();
    const { message_id, body: newBody, is_dm } = body;

    if (!message_id || !newBody?.trim()) {
      return NextResponse.json({ error: "message_id and body are required" }, { status: 400 });
    }

    const table = is_dm ? "dm_messages" : "messages";

    // Verify ownership
    const { data: existingMsg } = await admin
      .from(table)
      .select("sender_id")
      .eq("id", message_id)
      .maybeSingle();

    if (!existingMsg) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    if (existingMsg.sender_id !== user.id && role !== "admin") {
      return NextResponse.json({ error: "Forbidden: You can only edit your own messages" }, { status: 403 });
    }

    const { error } = await admin
      .from(table)
      .update({
        body: newBody.trim(),
        edited_at: new Date().toISOString(),
      })
      .eq("id", message_id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to update message" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized: Active session required" }, { status: 401 });
    }

    const { user, role } = auth;
    const admin = getAdminClient();
    const body = await req.json();
    const { message_id, is_dm } = body;

    if (!message_id) {
      return NextResponse.json({ error: "message_id is required" }, { status: 400 });
    }

    const table = is_dm ? "dm_messages" : "messages";

    // Verify ownership
    const { data: existingMsg } = await admin
      .from(table)
      .select("sender_id")
      .eq("id", message_id)
      .maybeSingle();

    if (!existingMsg) {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }

    if (existingMsg.sender_id !== user.id && role !== "admin") {
      return NextResponse.json({ error: "Forbidden: You can only delete your own messages" }, { status: 403 });
    }

    const { error } = await admin
      .from(table)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", message_id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to delete message" }, { status: 500 });
  }
}
