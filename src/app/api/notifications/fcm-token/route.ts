import { NextRequest, NextResponse } from "next/server";
import { getAdminClient, getAuthenticatedUser } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized: Active session required" }, { status: 401 });
    }
    const user = auth.user;

    const admin = getAdminClient();
    const { data: tokens, error } = await admin
      .from("fcm_tokens")
      .select("id, device_type, last_used_at, created_at")
      .eq("user_id", user.id);

    if (error) {
      console.error("Failed to query user FCM tokens:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      registered: (tokens || []).length > 0,
      count: (tokens || []).length,
      devices: tokens || [],
    });
  } catch (err: any) {
    console.error("GET FCM tokens error:", err);
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized: Active session required" }, { status: 401 });
    }
    const user = auth.user;

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

    // Normalize device_type to match DB check constraint: ('mobile_ios', 'mobile_android', 'desktop', 'unknown')
    let normalizedDeviceType: "mobile_ios" | "mobile_android" | "desktop" | "unknown" = "unknown";
    const ua = (user_agent || req.headers.get("user-agent") || "").toLowerCase();
    const dt = String(device_type || "").toLowerCase();

    if (dt === "mobile_ios" || dt === "ios" || ua.includes("iphone") || ua.includes("ipad")) {
      normalizedDeviceType = "mobile_ios";
    } else if (dt === "mobile_android" || dt === "android" || ua.includes("android")) {
      normalizedDeviceType = "mobile_android";
    } else if (dt === "desktop" || dt === "web" || dt === "browser" || ua.includes("windows") || ua.includes("macintosh") || ua.includes("linux")) {
      normalizedDeviceType = "desktop";
    }

    const { error } = await admin.from("fcm_tokens").upsert(
      {
        user_id: user.id,
        token: trimmedToken,
        device_type: normalizedDeviceType,
        user_agent: user_agent || req.headers.get("user-agent") || null,
        last_used_at: new Date().toISOString(),
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
    const auth = await getAuthenticatedUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized: Active session required" }, { status: 401 });
    }
    const user = auth.user;

    let token = "";
    try {
      const body = await req.json();
      token = body?.token;
    } catch {
      const { searchParams } = new URL(req.url);
      token = searchParams.get("token") || "";
    }

    const admin = getAdminClient();

    if (token && token !== "all") {
      const { error } = await admin
        .from("fcm_tokens")
        .delete()
        .eq("token", token.trim())
        .eq("user_id", user.id);

      if (error) {
        console.error("Failed to delete FCM token:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    } else {
      // Delete all tokens for this user
      const { error } = await admin
        .from("fcm_tokens")
        .delete()
        .eq("user_id", user.id);

      if (error) {
        console.error("Failed to delete all FCM tokens for user:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, message: "Notifications unregistered successfully" });
  } catch (err: any) {
    console.error("FCM token removal error:", err);
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}
