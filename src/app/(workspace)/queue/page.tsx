"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { useUserSession } from "@/contexts/UserSessionContext";
import { CallerCockpitSkeleton } from "@/components/queue/CallerCockpitSkeleton";

const DesktopQueue = dynamic(
  () => import("@/components/queue/DesktopQueue").then((mod) => mod.DesktopQueue),
  {
    loading: () => <CallerCockpitSkeleton />,
    ssr: false,
  }
);

const DesktopMirrorQueue = dynamic(
  () => import("@/components/queue/DesktopQueue").then((mod) => mod.DesktopMirrorQueue),
  {
    loading: () => <CallerCockpitSkeleton />,
    ssr: false,
  }
);

const CallerCockpit = dynamic(
  () => import("@/components/queue/CallerCockpit").then((mod) => mod.CallerCockpit),
  {
    loading: () => <CallerCockpitSkeleton />,
    ssr: false,
  }
);

function QueueEntry() {
  const [isMobile, setIsMobile] = useState<boolean | null>(null);
  const { profile, loading: sessionLoading } = useUserSession();
  const searchParams = useSearchParams();
  const impersonateParam = searchParams.get("impersonate");

  useEffect(() => {
    // 1. Detect viewport width (mobile breakpoint < 768px)
    const checkViewport = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkViewport();
    window.addEventListener("resize", checkViewport);

    return () => window.removeEventListener("resize", checkViewport);
  }, []);

  // During initial hydration / mount, render sleek loading skeleton inside cockpit
  if (isMobile === null || sessionLoading) {
    return <CallerCockpitSkeleton />;
  }

  const userRole = profile?.role || "caller";
  const isManagement = userRole === "admin" || userRole === "manager";

  // Forking principle (Zero media-query hiding):
  // 1. Mobile Caller -> New Designer 2 Caller Cockpit (5 screens)
  // 2. Mobile Admin/Manager Mirror -> Same Caller Cockpit in readOnly mode
  // 3. Desktop (any role) -> Existing dense DesktopQueue
  const isCaller = userRole === "caller";
  const isMirroring = Boolean(impersonateParam);

  const viewParam = searchParams.get("view");
  // Transparent Kanban is strictly reserved for Admin and Manager roles
  const initialView = isManagement && viewParam === "kanban" ? "kanban" : "cockpit";

  if (isCaller && isMobile) {
    return <CallerCockpit viewingAs="caller" initialView="cockpit" />;
  }

  if (isMirroring && isMobile) {
    return <CallerCockpit readOnly viewingAs="caller" initialView="cockpit" />;
  }

  if (isMirroring && impersonateParam) {
    if (viewParam === "table") {
      return <DesktopMirrorQueue callerId={impersonateParam} />;
    }
    return (
      <div className="min-h-[calc(100vh-100px)] w-full flex flex-col items-center justify-center p-2 sm:p-4">
        {/* Mirroring Banner */}
        <div className="mb-3 px-4 py-1.5 rounded-full bg-zinc-900/95 border border-white/15 text-xs text-zinc-300 shadow-xl backdrop-blur-md flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#F95721] animate-pulse shrink-0" />
          <span className="text-xs">
            Mirroring Caller Cockpit &mdash; Real-time caller viewport simulation
          </span>
        </div>

        {/* Scaled Phone Frame for Desktop Simulation */}
        <div className="w-[385px] max-w-[calc(100vw-32px)] h-[min(720px,calc(100vh-140px))] rounded-[42px] border-[8px] border-[#1e1d23] bg-[#0c0c0e] shadow-[0_25px_70px_-15px_rgba(0,0,0,0.95),0_0_0_1px_rgba(255,255,255,0.08)] flex flex-col overflow-hidden relative">
          {/* Phone Top Speaker & Dynamic Island */}
          <div className="w-24 h-3.5 rounded-full bg-black/90 mx-auto mt-2 shrink-0 z-50 flex items-center justify-center pointer-events-none border border-white/[0.06]">
            <div className="w-1.5 h-1.5 rounded-full bg-zinc-900 border border-zinc-700/60 mr-2" />
            <div className="w-7 h-1 rounded-full bg-zinc-800" />
          </div>

          {/* Live Cockpit inside Phone Frame */}
          <div className="flex-1 w-full overflow-hidden relative">
            <CallerCockpit
              callerId={impersonateParam}
              readOnly={true}
              viewingAs="caller"
              initialView="cockpit"
              embedded={true}
              hideMirrorBanner={true}
            />
          </div>

          {/* Phone Bottom Home Indicator */}
          <div className="w-24 h-1 rounded-full bg-white/25 mx-auto mb-1.5 shrink-0 z-50 pointer-events-none" />
        </div>
      </div>
    );
  }

  return <DesktopQueue />;
}

export default function QueuePage() {
  return (
    <Suspense fallback={<CallerCockpitSkeleton />}>
      <QueueEntry />
    </Suspense>
  );
}
