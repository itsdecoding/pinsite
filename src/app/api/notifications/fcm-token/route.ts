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
    return user;
  }

  // 2. Check Bearer token
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.replace("Bearer ", "").trim();
    const admin = getAdminClient();
    const { data: jwtData } = await admin.auth.getUser(token);
    if (jwtData?.user) {
      return jwtData.user;
    }
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized: Active session required" }, { status: 401 });
    }

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { token, device_type, user_agent } = body;
    if (!token || typeof token !== "string" || !token.trim()) {
      return NextResponse.json({ error: "FCM registration token is required" }, { status: 400 });
    }

    const trimmedToken = token.trim();
    const admin = getAdminClient();

    const { error } = await admin.from("fcm_tokens").upsert(
      {
        user_id: user.id,
        token: trimmedToken,
        device_type: device_type || "web",
        user_agent: user_agent || req.headers.get("user-agent") || null,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "token" }
    );

    if (error) {
      console.error("Failed to upsert FCM token:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Token registered successfully" });
  } catch (err: any) {
    console.error("FCM token registration error:", err);
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized: Active session required" }, { status: 401 });
    }

    let token = "";
    try {
      const body = await req.json();
      token = body?.token;
    } catch {
      const { searchParams } = new URL(req.url);
      token = searchParams.get("token") || "";
    }

    if (!token || typeof token !== "string" || !token.trim()) {
      return NextResponse.json({ error: "FCM token is required" }, { status: 400 });
    }

    const admin = getAdminClient();
    const { error } = await admin
      .from("fcm_tokens")
      .delete()
      .eq("token", token.trim())
      .eq("user_id", user.id);

    if (error) {
      console.error("Failed to delete FCM token:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Token removed successfully" });
  } catch (err: any) {
    console.error("FCM token removal error:", err);
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}
