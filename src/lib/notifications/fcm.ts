import { getFirebaseAdminMessaging } from "@/lib/firebase/admin";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import type { MulticastMessage, SendResponse } from "firebase-admin/messaging";

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createAdminClient(supabaseUrl, supabaseServiceKey);
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  link?: string;
  data?: Record<string, string>;
}

export interface SendPushResult {
  success: boolean;
  deliveredCount?: number;
  failureCount?: number;
  reason?: string;
}

/**
 * Sends FCM push notification to one or more user IDs across all their registered devices (web/mobile).
 * Handles invalid or expired token cleanup automatically.
 */
export async function sendFCMNotificationToUser(
  userIds: string | string[],
  payload: PushNotificationPayload
): Promise<SendPushResult> {
  const messaging = getFirebaseAdminMessaging();
  if (!messaging) {
    // Firebase is not configured in this environment; safely skip
    return { success: false, reason: "firebase_not_configured" };
  }

  const userIdsArray = Array.isArray(userIds) ? userIds : [userIds];
  if (userIdsArray.length === 0) {
    return { success: true, deliveredCount: 0 };
  }

  const supabase = getAdminClient();

  // Fetch all active FCM registration tokens for the given users
  const { data: tokenRecords, error: dbError } = await supabase
    .from("fcm_tokens")
    .select("token, user_id")
    .in("user_id", userIdsArray);

  if (dbError) {
    console.error("Failed to query fcm_tokens:", dbError);
    return { success: false, reason: "db_error" };
  }

  if (!tokenRecords || tokenRecords.length === 0) {
    return { success: true, deliveredCount: 0 };
  }

  const tokens = Array.from(new Set(tokenRecords.map((r: { token: string }) => r.token).filter(Boolean)));
  if (tokens.length === 0) {
    return { success: true, deliveredCount: 0 };
  }

  const targetUrl = payload.link || "/studio/comms";

  // Build Firebase multicast message
  const multicastMessage: MulticastMessage = {
    tokens,
    notification: {
      title: payload.title,
      body: payload.body,
    },
    data: {
      ...(payload.data || {}),
      title: payload.title,
      body: payload.body,
      url: targetUrl,
      click_action: targetUrl,
    },
    webpush: {
      fcmOptions: {
        link: targetUrl,
      },
      notification: {
        title: payload.title,
        body: payload.body,
        icon: "/favicon.ico",
        badge: "/favicon.ico",
        vibrate: [200, 100, 200],
        data: {
          url: targetUrl,
        },
      },
    },
  };

  try {
    const response = await messaging.sendEachForMulticast(multicastMessage);

    // Identify stale or invalid registration tokens and prune them from DB
    const tokensToDelete: string[] = [];
    response.responses.forEach((resp: SendResponse, idx: number) => {
      if (!resp.success && resp.error) {
        const errorCode = resp.error.code;
        if (
          errorCode === "messaging/registration-token-not-registered" ||
          errorCode === "messaging/invalid-registration-token"
        ) {
          tokensToDelete.push(tokens[idx]);
        }
      }
    });

    if (tokensToDelete.length > 0) {
      try {
        await supabase.from("fcm_tokens").delete().in("token", tokensToDelete);
      } catch (cleanupErr) {
        console.warn("Failed to prune invalid FCM tokens:", cleanupErr);
      }
    }

    return {
      success: true,
      deliveredCount: response.successCount,
      failureCount: response.failureCount,
    };
  } catch (err: any) {
    console.error("FCM sendEachForMulticast error:", err);
    return { success: false, reason: err?.message || "multicast_error" };
  }
}
