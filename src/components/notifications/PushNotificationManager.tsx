"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Bell,
  BellOff,
  BellRing,
  CheckCircle2,
  AlertCircle,
  X,
  Send,
  Loader2,
  Smartphone,
  Laptop,
  HelpCircle,
  ExternalLink,
} from "lucide-react";
import { useUserSession } from "@/contexts/UserSessionContext";
import { getFirebaseMessagingInstance } from "@/lib/firebase/client";
import { getToken } from "firebase/messaging";
import { createClient } from "@/lib/supabase/client";

export function openPushNotificationSettings() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("open-push-notification-settings"));
  }
}

export function PushNotificationManager() {
  const { user } = useUserSession();
  const [isOpen, setIsOpen] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [isRegistered, setIsRegistered] = useState(false);
  const [deviceCount, setDeviceCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);

  // Check client support & permission
  const checkStatus = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) {
      setPermission("unsupported");
      return;
    }

    setPermission(Notification.permission);

    if (user?.id) {
      try {
        const res = await fetch("/api/notifications/fcm-token");
        if (res.ok) {
          const data = await res.json();
          setIsRegistered(data.registered);
          setDeviceCount(data.count || 0);
        }
      } catch {
        // Ignore network errors
      }
    }
  }, [user?.id]);

  useEffect(() => {
    checkStatus();

    const handleOpen = () => {
      setIsOpen(true);
      setFeedback(null);
      checkStatus();
    };

    window.addEventListener("open-push-notification-settings", handleOpen);
    return () => {
      window.removeEventListener("open-push-notification-settings", handleOpen);
    };
  }, [checkStatus]);

  // Turn ON push notifications
  const handleEnablePush = async () => {
    if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) {
      setFeedback({ type: "error", message: "Push notifications are not supported by this browser." });
      return;
    }

    setLoading(true);
    setFeedback(null);

    try {
      const resPermission = await Notification.requestPermission();
      setPermission(resPermission);

      if (resPermission !== "granted") {
        setFeedback({
          type: "error",
          message:
            resPermission === "denied"
              ? "Notifications were blocked. Please enable them in your browser/device site settings."
              : "Notification permission was dismissed.",
        });
        setLoading(false);
        return;
      }

      // Register service worker
      const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
      const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
      const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
      const messagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
      const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;

      const swUrl = `/firebase-messaging-sw.js?apiKey=${encodeURIComponent(apiKey || "")}&projectId=${encodeURIComponent(projectId || "")}&messagingSenderId=${encodeURIComponent(messagingSenderId || "")}&appId=${encodeURIComponent(appId || "")}`;

      const swRegistration = await navigator.serviceWorker.register(swUrl, { scope: "/" });
      const messaging = await getFirebaseMessagingInstance();

      if (!messaging) {
        throw new Error("Could not initialize Firebase Cloud Messaging.");
      }

      const token = await getToken(messaging, {
        vapidKey: vapidKey || undefined,
        serviceWorkerRegistration: swRegistration,
      });

      if (!token) {
        throw new Error("Unable to retrieve Firebase FCM device token.");
      }

      // Determine device type matching backend constraints ('mobile_ios', 'mobile_android', 'desktop', 'unknown')
      const ua = navigator.userAgent.toLowerCase();
      const isIOS = /iphone|ipad|ipod/.test(ua);
      const isAndroid = /android/.test(ua);
      const deviceType = isIOS ? "mobile_ios" : isAndroid ? "mobile_android" : "desktop";

      // Save token to server
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const bearerToken = sessionData?.session?.access_token;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (bearerToken) {
        headers["Authorization"] = `Bearer ${bearerToken}`;
      }

      const saveRes = await fetch("/api/notifications/fcm-token", {
        method: "POST",
        headers,
        body: JSON.stringify({
          token,
          device_type: deviceType,
          user_agent: navigator.userAgent,
        }),
      });

      if (!saveRes.ok) {
        const errJson = await saveRes.json().catch(() => ({}));
        throw new Error(errJson.error || "Failed to persist token on server.");
      }

      setIsRegistered(true);
      setDeviceCount((prev) => Math.max(prev, 1));
      setFeedback({
        type: "success",
        message: "Push notifications successfully enabled on this device! You will now receive instant alerts.",
      });

      window.dispatchEvent(new CustomEvent("push-status-changed", { detail: { enabled: true } }));
    } catch (err: any) {
      console.error("Enable push error:", err);
      setFeedback({ type: "error", message: err.message || "Failed to enable push notifications." });
    } finally {
      setLoading(false);
    }
  };

  // Turn OFF push notifications
  const handleDisablePush = async () => {
    setLoading(true);
    setFeedback(null);

    try {
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const bearerToken = sessionData?.session?.access_token;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (bearerToken) {
        headers["Authorization"] = `Bearer ${bearerToken}`;
      }

      const res = await fetch("/api/notifications/fcm-token?token=all", {
        method: "DELETE",
        headers,
      });

      if (!res.ok) {
        throw new Error("Failed to unregister notification token.");
      }

      setIsRegistered(false);
      setDeviceCount(0);
      setFeedback({
        type: "info",
        message: "Push notifications turned off. You will no longer receive alerts when the app is in the background.",
      });

      window.dispatchEvent(new CustomEvent("push-status-changed", { detail: { enabled: false } }));
    } catch (err: any) {
      console.error("Disable push error:", err);
      setFeedback({ type: "error", message: err.message || "Failed to turn off notifications." });
    } finally {
      setLoading(false);
    }
  };

  // Send real test notification
  const handleSendTest = async () => {
    setTestSending(true);
    setFeedback(null);

    try {
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const bearerToken = sessionData?.session?.access_token;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (bearerToken) {
        headers["Authorization"] = `Bearer ${bearerToken}`;
      }

      const res = await fetch("/api/notifications/fcm-test", {
        method: "POST",
        headers,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to send test push notification.");
      }

      setFeedback({
        type: "success",
        message: `Test push sent successfully to ${data.deliveredCount || 1} device(s)! Check your status bar or lockscreen.`,
      });
    } catch (err: any) {
      console.error("Test notification error:", err);
      setFeedback({ type: "error", message: err.message || "Failed to dispatch test notification." });
    } finally {
      setTestSending(false);
    }
  };

  if (!isOpen) return null;

  const isIOSDevice =
    typeof navigator !== "undefined" &&
    /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase());

  return (
    <div
      role="dialog"
      aria-label="Push Notification Settings"
      className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex flex-col justify-end sm:justify-center sm:items-center p-0 sm:p-4 animate-in fade-in duration-200"
      onClick={() => setIsOpen(false)}
    >
      <div
        className="bg-white dark:bg-[#141516] border-t sm:border border-black/[0.1] dark:border-white/[0.12] rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 shadow-2xl max-w-lg w-full mx-auto space-y-5 animate-in slide-in-from-bottom duration-250 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-black/[0.06] dark:border-white/[0.08]">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-[#D97706]/15 border border-[#D97706]/30 flex items-center justify-center text-[#F59E0B]">
              <BellRing className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#111110] dark:text-white leading-tight">
                Push Notifications
              </h3>
              <p className="text-xs text-zinc-500">
                Manage mobile & desktop background alerts
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="p-1.5 rounded-full text-zinc-400 hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`p-3 rounded-2xl text-xs flex items-start gap-2.5 animate-in fade-in ${
              feedback.type === "success"
                ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                : feedback.type === "error"
                ? "bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300"
                : "bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300"
            }`}
          >
            {feedback.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-500" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
            )}
            <span className="flex-1 leading-relaxed font-medium">{feedback.message}</span>
          </div>
        )}

        {/* Device Status Card */}
        <div className="p-4 rounded-2xl bg-black/[0.03] dark:bg-white/[0.04] border border-black/[0.06] dark:border-white/[0.06] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              Status On This Device
            </span>

            {permission === "granted" && isRegistered ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Active
              </span>
            ) : permission === "denied" ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs font-bold">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                Blocked
              </span>
            ) : permission === "unsupported" ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-zinc-500/15 border border-zinc-500/30 text-zinc-500 text-xs font-bold">
                Unsupported
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-bold">
                Not Enabled
              </span>
            )}
          </div>

          <div className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
            {permission === "granted" && isRegistered ? (
              <p>
                This device is registered to receive instant push alerts for <strong>Direct Messages</strong> and{" "}
                <strong>@mentions</strong>, even when your browser tab or phone screen is locked.
              </p>
            ) : permission === "denied" ? (
              <p>
                Notifications are blocked by your browser settings for <strong>pinsite.pro</strong>. You can unblock
                them by tapping the lock/tune icon 🔒 in your browser address bar and selecting{" "}
                <em>Notifications: Allow</em>.
              </p>
            ) : permission === "unsupported" ? (
              <p>
                Web push notifications are not supported in this browser. On iPhones, tap the <strong>Share</strong>{" "}
                icon in Safari and choose <strong>&ldquo;Add to Home Screen&rdquo;</strong> to enable push notifications.
              </p>
            ) : (
              <p>
                Push notifications are not enabled yet on this device. Turn them on to receive urgent messages, team
                updates, and caller notifications.
              </p>
            )}
          </div>

          {/* Registered devices count */}
          {deviceCount > 0 && (
            <div className="pt-2 border-t border-black/[0.04] dark:border-white/[0.04] flex items-center justify-between text-[11px] text-zinc-500">
              <span className="flex items-center gap-1.5">
                <Smartphone className="w-3.5 h-3.5" />
                <span>Total registered devices for your account:</span>
              </span>
              <span className="font-bold text-zinc-800 dark:text-zinc-200">{deviceCount}</span>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="space-y-2 pt-1">
          {permission !== "granted" || !isRegistered ? (
            <button
              type="button"
              onClick={handleEnablePush}
              disabled={loading || permission === "unsupported"}
              className="w-full h-11 rounded-2xl bg-gradient-to-r from-[#D97706] to-[#B45309] hover:from-[#B45309] hover:to-[#92400E] text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg active:scale-98 transition disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Enabling Alerts...</span>
                </>
              ) : (
                <>
                  <Bell className="w-4 h-4" />
                  <span>Turn On Push Notifications</span>
                </>
              )}
            </button>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleSendTest}
                disabled={testSending || loading}
                className="w-full h-10 rounded-2xl bg-[#D97706]/15 hover:bg-[#D97706]/25 border border-[#D97706]/40 text-[#F59E0B] text-xs font-bold flex items-center justify-center gap-2 transition active:scale-98 disabled:opacity-50"
              >
                {testSending ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Sending Test...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Send Test Alert</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleDisablePush}
                disabled={loading || testSending}
                className="w-full h-10 rounded-2xl bg-black/[0.04] dark:bg-white/[0.05] hover:bg-rose-500/10 hover:text-rose-500 text-zinc-600 dark:text-zinc-400 text-xs font-medium flex items-center justify-center gap-2 transition active:scale-98 disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <BellOff className="w-3.5 h-3.5" />
                )}
                <span>Turn Off Alerts</span>
              </button>
            </div>
          )}
        </div>

        {/* Helpful Tips Section */}
        <div className="pt-2 border-t border-black/[0.06] dark:border-white/[0.08] text-[11px] text-zinc-500 space-y-1.5">
          <div className="flex items-center gap-1.5 font-semibold text-zinc-700 dark:text-zinc-300">
            <HelpCircle className="w-3.5 h-3.5 text-[#F59E0B]" />
            <span>Mobile tips:</span>
          </div>
          <ul className="list-disc list-inside space-y-1 text-zinc-500 pl-1">
            <li>
              <strong>Android:</strong> Chrome delivers push alerts directly to your system tray & lockscreen.
            </li>
            <li>
              <strong>iOS (iPhone/iPad):</strong> Requires iOS 16.4+. Add to Home Screen (Share &rarr; Add to Home
              Screen) to enable background push.
            </li>
            <li>
              Alerts only trigger for DMs sent directly to you, or channel messages where you are <code>@mentioned</code> or{" "}
              <code>@all</code> is used.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

/**
 * Universal Notification Toggle Button for Headers and Menus
 */
export function NotificationToggleButton({
  className = "",
  showLabel = false,
}: {
  className?: string;
  showLabel?: boolean;
}) {
  const [isGranted, setIsGranted] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setIsGranted(Notification.permission === "granted");
    }

    const handleStatus = (e: any) => {
      setIsGranted(Boolean(e.detail?.enabled));
    };

    window.addEventListener("push-status-changed", handleStatus);
    return () => window.removeEventListener("push-status-changed", handleStatus);
  }, []);

  return (
    <button
      type="button"
      onClick={openPushNotificationSettings}
      title={isGranted ? "Push Notifications Active (Tap to manage)" : "Push Notifications Off (Tap to enable)"}
      className={`relative flex items-center gap-2 p-2 rounded-xl text-zinc-600 dark:text-zinc-300 hover:text-[#F95721] hover:bg-black/5 dark:hover:bg-white/10 active:scale-95 transition ${className}`}
    >
      <div className="relative">
        <Bell className="w-4 h-4" />
        {isGranted ? (
          <span
            title="Push alerts active"
            className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-[#141516]"
          />
        ) : (
          <span
            title="Push alerts off"
            className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-500 ring-2 ring-white dark:ring-[#141516]"
          />
        )}
      </div>
      {showLabel && (
        <span className="text-xs font-medium">
          {isGranted ? "Notifications On" : "Notifications Off"}
        </span>
      )}
    </button>
  );
}
