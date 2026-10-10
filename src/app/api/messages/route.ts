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

      const currentUserIdLower = user.id.toLowerCase();
      const userALower = (thread.user_a || "").toLowerCase();
      const userBLower = (thread.user_b || "").toLowerCase();

      if (userALower !== currentUserIdLower && userBLower !== currentUserIdLower && role !== "admin") {
        return NextResponse.json({ error: "Forbidden: Not a participant in this conversation" }, { status: 403 });
      }

      // Mark unread messages as read for this user
      await admin
        .from("dm_messages")
        .update({ read_at: new Date().toISOString() })
        .eq("thread_id", threadId)
        .neq("sender_id", user.id)
        .is("read_at", null);

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

      const { data, error } = await admin
        .from("dm_messages")
        .select(`
          id,
          sender_id,
          body,
          created_at,
          edited_at,
          deleted_at,
          read_at,
          attachments,
          profiles:sender_id (full_name, role)
        `)
        .eq("thread_id", threadId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });

      if (error) throw error;
      return NextResponse.json({ messages: data || [] });
    } else if (channelId) {
      // Check if channel exists and if private (e.g. #management)
      const { data: channel } = await admin
        .from("channels")
        .select("is_private, name")
        .eq("id", channelId)
        .maybeSingle();

      if (!channel) {
        return NextResponse.json({ error: "Channel not found" }, { status: 404 });
      }

      if (channel.is_private && role !== "admin" && role !== "manager") {
        return NextResponse.json({ error: "Forbidden: Restricted management channel" }, { status: 403 });
      }

      // Also mark in-app notifications for this channel as read
      try {
        await admin
          .from("notifications")
          .update({ read_at: new Date().toISOString() })
          .eq("user_id", user.id)
          .or(`link.eq./studio/comms?channel=${channelId},link.eq./comms?channel=${channelId}`)
          .is("read_at", null);
      } catch (notifErr) {
        console.warn("Failed to mark channel notifications as read:", notifErr);
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
          parent_message_id,
          attachments,
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
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const { channel_id, thread_id, body: messageBody, is_dm, parent_message_id, attachments } = body;

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

      const currentUserIdLower = user.id.toLowerCase();
      const userALower = (thread?.user_a || "").toLowerCase();
      const userBLower = (thread?.user_b || "").toLowerCase();

      if (!thread || (userALower !== currentUserIdLower && userBLower !== currentUserIdLower && role !== "admin")) {
        return NextResponse.json({ error: "Forbidden: Not a participant in this conversation" }, { status: 403 });
      }

      const { data: newDm, error: dmError } = await admin
        .from("dm_messages")
        .insert({
          thread_id,
          sender_id: senderId,
          body: messageBody.trim(),
          attachments: Array.isArray(attachments) ? attachments : [],
        })
        .select(`
          id,
          sender_id,
          body,
          created_at,
          edited_at,
          deleted_at,
          read_at,
          attachments,
          profiles:sender_id (full_name, role)
        `)
        .single();

      if (dmError) throw dmError;

      // Dispatch in-app notification to the other participant
      try {
        const recipientId = userALower === currentUserIdLower ? thread.user_b : thread.user_a;
        const { data: senderProf } = await admin
          .from("profiles")
          .select("full_name")
          .eq("id", user.id)
          .maybeSingle();

        await admin.from("notifications").insert({
          user_id: recipientId,
          type: "dm",
          title: `New DM from ${senderProf?.full_name || "a teammate"}`,
          body: messageBody.trim().slice(0, 150),
          link: `/studio/comms?dm=${user.id}`,
        });
      } catch (notifErr) {
        console.warn("Failed to dispatch DM notification:", notifErr);
      }

      return NextResponse.json({ message: newDm }, { status: 201 });
    } else {
      if (!channel_id) {
        return NextResponse.json({ error: "channel_id is required for channel messages" }, { status: 400 });
      }

      // If channel is private, check role
      const { data: channel } = await admin
        .from("channels")
        .select("is_private, name")
        .eq("id", channel_id)
        .maybeSingle();

      if (!channel) {
        return NextResponse.json({ error: "Channel not found" }, { status: 404 });
      }

      if (channel.is_private && role !== "admin" && role !== "manager") {
        return NextResponse.json({ error: "Forbidden: Restricted management channel" }, { status: 403 });
      }

      const { data: newMsg, error: msgError } = await admin
        .from("messages")
        .insert({
          channel_id,
          sender_id: senderId,
          body: messageBody.trim(),
          parent_message_id: parent_message_id || null,
          attachments: Array.isArray(attachments) ? attachments : [],
        })
        .select(`
          id,
          sender_id,
          body,
          created_at,
          edited_at,
          deleted_at,
          parent_message_id,
          attachments,
          profiles:sender_id (full_name, role)
        `)
        .single();

      if (msgError) throw msgError;

      // Dispatch in-app notifications for @mentions
      try {
        const isAtAll = /@all\b/i.test(messageBody);
        const { data: activeProfiles } = await admin
          .from("profiles")
          .select("id, full_name")
          .eq("active", true)
          .neq("id", user.id);

        if (activeProfiles && activeProfiles.length > 0) {
          const mentionedProfiles = activeProfiles.filter((p) => {
            if (isAtAll) return true;
            if (!p.full_name || !p.full_name.trim()) return false;
            const fullNameRegex = new RegExp(`@${p.full_name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
            if (fullNameRegex.test(messageBody)) return true;
            const firstName = p.full_name.trim().split(/\s+/)[0];
            if (firstName && firstName.length >= 2) {
              const firstNameRegex = new RegExp(`@${firstName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
              return firstNameRegex.test(messageBody);
            }
            return false;
          });

          if (mentionedProfiles.length > 0) {
            const { data: senderProf } = await admin
              .from("profiles")
              .select("full_name")
              .eq("id", user.id)
              .maybeSingle();

            const chName = channel?.name || "a channel";
            const senderName = senderProf?.full_name || "A teammate";

            const notificationsToInsert = mentionedProfiles.map((p) => ({
              user_id: p.id,
              type: "mention",
              title: `${senderName} mentioned you in #${chName}`,
              body: messageBody.trim().slice(0, 150),
              link: `/studio/comms?channel=${channel_id}`,
            }));

            await admin.from("notifications").insert(notificationsToInsert);
          }
        }
      } catch (notifErr) {
        console.warn("Failed to dispatch mention notifications:", notifErr);
      }

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
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
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
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
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
