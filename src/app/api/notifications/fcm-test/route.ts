import { NextRequest, NextResponse } from "next/server";
import { sendFCMNotificationToUser } from "@/lib/notifications/fcm";
import { getAdminClient, getAuthenticatedUser } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(req);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized: Active session required" }, { status: 401 });
    }
    const user = auth.user;

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
