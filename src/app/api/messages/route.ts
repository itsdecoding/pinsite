import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_ADMIN_ID = "a87c7c79-6c4c-4787-8132-8cff8f7a1e74";

export async function GET(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { searchParams } = new URL(req.url);
    const channelId = searchParams.get("channel_id");
    const threadId = searchParams.get("thread_id");

    if (threadId) {
      const { data, error } = await supabase
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
      const { data, error } = await supabase
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
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { channel_id, thread_id, body: messageBody, sender_id, is_dm } = body;

    if (!messageBody || !messageBody.trim()) {
      return NextResponse.json({ error: "Message body is required" }, { status: 400 });
    }

    // Determine sender ID
    let senderId = sender_id;
    if (!senderId) {
      senderId = DEFAULT_ADMIN_ID;
    }

    if (is_dm || thread_id) {
      if (!thread_id) {
        return NextResponse.json({ error: "thread_id is required for DMs" }, { status: 400 });
      }

      const { data: newDm, error: dmError } = await supabase
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

      const { data: newMsg, error: msgError } = await supabase
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
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { message_id, body: newBody, is_dm } = body;

    if (!message_id || !newBody?.trim()) {
      return NextResponse.json({ error: "message_id and body are required" }, { status: 400 });
    }

    const table = is_dm ? "dm_messages" : "messages";
    const { error } = await supabase
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
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { message_id, is_dm } = body;

    if (!message_id) {
      return NextResponse.json({ error: "message_id is required" }, { status: 400 });
    }

    const table = is_dm ? "dm_messages" : "messages";
    const { error } = await supabase
      .from(table)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", message_id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to delete message" }, { status: 500 });
  }
}
