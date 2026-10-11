"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Bell, X, ArrowRight, MessageSquare } from "lucide-react";
import { useUserSession } from "@/contexts/UserSessionContext";
import { getFirebaseMessagingInstance } from "@/lib/firebase/client";
import { getToken, onMessage } from "firebase/messaging";
import { createClient } from "@/lib/supabase/client";

interface ForegroundToast {
  id: string;
  title: string;
  body: string;
  url: string;
}

export function FCMHandler() {
  const { user } = useUserSession();
  const router = useRouter();

  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [showPromptBanner, setShowPromptBanner] = useState(false);
  const [activeToast, setActiveToast] = useState<ForegroundToast | null>(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const registeredTokenRef = useRef<string | null>(null);

  // Initialize permission state
  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) {
      setPermission("unsupported");
      return;
    }

    setPermission(Notification.permission);

    // If permission was dismissed before in this session or dismissed permanently
    const dismissed = localStorage.getItem("agency_fcm_prompt_dismissed");
    if (Notification.permission === "default" && !dismissed) {
      // Delay showing the prompt slightly so user can orient first
      const timer = setTimeout(() => setShowPromptBanner(true), 3000);
      return () => clearTimeout(timer);
    }
  }, []);

  // Token registration worker
  const registerDeviceToken = useCallback(async () => {
    if (!user) return;
    if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("Notification" in window)) {
      return;
    }
    if (Notification.permission !== "granted") return;

    try {
      setIsRegistering(true);

      const vapidKey = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;
      const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
      const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
      const messagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID;
      const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;

      // Register or update service worker with config parameters
      const swUrl = `/firebase-messaging-sw.js?apiKey=${encodeURIComponent(apiKey || "")}&projectId=${encodeURIComponent(projectId || "")}&messagingSenderId=${encodeURIComponent(messagingSenderId || "")}&appId=${encodeURIComponent(appId || "")}`;

      const swRegistration = await navigator.serviceWorker.register(swUrl, {
        scope: "/",
      });

      const messaging = await getFirebaseMessagingInstance();
      if (!messaging) {
        setIsRegistering(false);
        return;
      }

      const currentToken = await getToken(messaging, {
        vapidKey: vapidKey || undefined,
        serviceWorkerRegistration: swRegistration,
      });

      if (currentToken) {
        registeredTokenRef.current = currentToken;

        // Determine device type
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
          navigator.userAgent
        );
        const deviceType = isMobile ? "mobile" : "web";

        // Save token to server
        const supabase = createClient();
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }

        await fetch("/api/notifications/fcm-token", {
          method: "POST",
          headers,
          body: JSON.stringify({
            token: currentToken,
            device_type: deviceType,
            user_agent: navigator.userAgent,
          }),
        }).catch((err) => console.warn("Failed to persist FCM token to backend:", err));
      }
    } catch (err) {
      console.warn("FCM device token registration error:", err);
    } finally {
      setIsRegistering(false);
    }
  }, [user]);

  // Request permission explicitly on user action
  const handleEnableNotifications = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;

    try {
      const res = await Notification.requestPermission();
      setPermission(res);
      setShowPromptBanner(false);

      if (res === "granted") {
        await registerDeviceToken();
      } else {
        localStorage.setItem("agency_fcm_prompt_dismissed", "true");
      }
    } catch (err) {
      console.warn("Error requesting notification permission:", err);
    }
  };

  const handleDismissPrompt = () => {
    setShowPromptBanner(false);
    localStorage.setItem("agency_fcm_prompt_dismissed", "true");
  };

  // Register token when user session is active and permission is already granted
  useEffect(() => {
    if (user && permission === "granted") {
      registerDeviceToken();
    }
  }, [user, permission, registerDeviceToken]);

  // Listen for incoming foreground messages
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    const setupForegroundListener = async () => {
      const messaging = await getFirebaseMessagingInstance();
      if (!messaging) return;

      unsubscribe = onMessage(messaging, (payload) => {
        const title = payload.notification?.title || payload.data?.title || "New Notification";
        const body = payload.notification?.body || payload.data?.body || "";
        const url = payload.data?.url || payload.fcmOptions?.link || "/studio/comms";

        // If page is hidden in background, trigger a system notification if permitted
        if (document.visibilityState === "hidden" && Notification.permission === "granted") {
          try {
            new Notification(title, {
              body,
              icon: "/favicon.ico",
              data: { url },
            });
          } catch {
            // Notification constructor may fail on some mobile platforms
          }
        }

        // Show elegant in-app toast
        setActiveToast({
          id: Math.random().toString(36).substring(7),
          title,
          body,
          url,
        });
      });
    };

    if (permission === "granted") {
      setupForegroundListener();
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [permission]);

  // Auto-dismiss active toast after 6 seconds
  useEffect(() => {
    if (!activeToast) return;
    const timer = setTimeout(() => {
      setActiveToast(null);
    }, 6000);
    return () => clearTimeout(timer);
  }, [activeToast]);

  return (
    <>
      {/* 1. Subtle Permission Prompt Banner */}
      {showPromptBanner && permission === "default" && user && (
        <div className="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-50 max-w-sm w-[calc(100vw-2rem)] animate-in fade-in slide-in-from-bottom-4 duration-300">
          <div className="bg-[#141413]/95 dark:bg-[#141413]/95 text-white backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-2xl flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#D97706]/20 border border-[#D97706]/30 flex items-center justify-center shrink-0 text-[#F59E0B]">
                <Bell className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0 pr-1">
                <h4 className="text-sm font-semibold text-white tracking-tight">Enable Push Notifications</h4>
                <p className="text-xs text-neutral-400 mt-0.5 leading-relaxed">
                  Get instant message and mention alerts on desktop & mobile even when tabs are closed.
                </p>
              </div>
              <button
                onClick={handleDismissPrompt}
                className="text-neutral-500 hover:text-white p-1 rounded-lg transition-colors"
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-2 mt-1">
              <button
                onClick={handleEnableNotifications}
                disabled={isRegistering}
                className="flex-1 h-8 rounded-lg bg-gradient-to-r from-[#D97706] to-[#B45309] hover:from-[#B45309] hover:to-[#92400E] text-white text-xs font-medium transition-all shadow-md active:scale-95 disabled:opacity-50"
              >
                {isRegistering ? "Enabling..." : "Enable Alerts"}
              </button>
              <button
                onClick={handleDismissPrompt}
                className="px-3 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white text-xs font-medium transition-colors"
              >
                Later
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Foreground Real-time Incoming Message Toast */}
      {activeToast && (
        <div className="fixed top-4 right-4 sm:top-6 sm:right-6 z-50 max-w-sm w-[calc(100vw-2rem)] animate-in fade-in slide-in-from-top-4 duration-300">
          <div
            onClick={() => {
              const url = activeToast.url;
              setActiveToast(null);
              router.push(url);
            }}
            className="group cursor-pointer bg-[#181816]/95 dark:bg-[#181816]/95 text-white backdrop-blur-xl border border-white/10 hover:border-[#D97706]/50 rounded-2xl p-4 shadow-2xl flex items-start gap-3 transition-all hover:scale-[1.01]"
          >
            <div className="w-10 h-10 rounded-xl bg-[#D97706]/20 border border-[#D97706]/30 flex items-center justify-center shrink-0 text-[#F59E0B] group-hover:scale-105 transition-transform">
              <MessageSquare className="w-5 h-5" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-semibold text-white truncate">{activeToast.title}</span>
                <span className="text-[10px] text-neutral-500">just now</span>
              </div>
              <p className="text-xs text-neutral-300 mt-1 line-clamp-2 leading-snug">{activeToast.body}</p>
              <div className="flex items-center gap-1 text-[11px] text-[#F59E0B] font-medium mt-2">
                <span>View conversation</span>
                <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                setActiveToast(null);
              }}
              className="text-neutral-500 hover:text-white p-1 rounded-lg transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
