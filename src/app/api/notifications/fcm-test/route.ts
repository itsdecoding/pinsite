import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { sendFCMNotificationToUser } from "@/lib/notifications/fcm";

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

    const admin = getAdminClient();
    const { data: tokens, error: tokenError } = await admin
      .from("fcm_tokens")
      .select("id, token, device_type")
      .eq("user_id", user.id);

    if (tokenError) {
      return NextResponse.json({ error: tokenError.message }, { status: 500 });
    }

    if (!tokens || tokens.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "No registered devices found for your account. Please click 'Enable Alerts' on this device first.",
          deliveredCount: 0,
        },
        { status: 400 }
      );
    }

    const result = await sendFCMNotificationToUser(user.id, {
      title: "Pinsite Push Test 🚀",
      body: "Push notifications are working perfectly on this device!",
      link: "/studio/comms",
      data: {
        type: "test",
        timestamp: String(Date.now()),
      },
    });

    return NextResponse.json({
      success: result.success,
      deliveredCount: result.deliveredCount ?? 0,
      failureCount: result.failureCount ?? 0,
      totalDevices: tokens.length,
      devices: tokens.map((t) => t.device_type),
      message: `Test notification sent to ${tokens.length} device(s)!`,
    });
  } catch (err: any) {
    console.error("Test notification dispatch error:", err);
    return NextResponse.json({ error: err?.message || "Failed to dispatch test notification" }, { status: 500 });
  }
}
