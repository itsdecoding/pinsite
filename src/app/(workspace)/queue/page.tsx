"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useUserSession } from "@/contexts/UserSessionContext";
import { DesktopQueue } from "@/components/queue/DesktopQueue";
import { DesktopMirrorQueue } from "@/components/queue/DesktopMirrorQueue";
import { CallerCockpit, CallerCockpitSkeleton } from "@/components/queue/CallerCockpit";

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

  // Forking principle (Zero media-query hiding):
  // 1. Mobile Caller -> New Designer 2 Caller Cockpit (5 screens)
  // 2. Mobile Admin/Manager Mirror -> Same Caller Cockpit in readOnly mode
  // 3. Desktop (any role) -> Existing dense DesktopQueue
  const isCaller = userRole === "caller";
  const isMirroring = Boolean(impersonateParam);

  const viewParam = searchParams.get("view");
  const initialView = viewParam === "kanban" ? "kanban" : "cockpit";

  if (isCaller && isMobile) {
    return <CallerCockpit initialView={initialView} />;
  }

  if (isMirroring && isMobile) {
    return <CallerCockpit readOnly initialView={initialView} />;
  }

  if (isMirroring && impersonateParam) {
    return <DesktopMirrorQueue callerId={impersonateParam} />;
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
