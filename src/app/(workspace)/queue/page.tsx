"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { DesktopQueue } from "@/components/queue/DesktopQueue";
import { DesktopMirrorQueue } from "@/components/queue/DesktopMirrorQueue";
import { CallerCockpit, CallerCockpitSkeleton } from "@/components/queue/CallerCockpit";

function QueueEntry() {
  const [isMobile, setIsMobile] = useState<boolean | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const impersonateParam = searchParams.get("impersonate");

  useEffect(() => {
    // 1. Detect viewport width (mobile breakpoint < 768px)
    const checkViewport = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkViewport();
    window.addEventListener("resize", checkViewport);

    // 2. Fetch authenticated user profile role
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle()
          .then(({ data }) => {
            setUserRole(data?.role || "caller");
          });
      } else {
        setUserRole("caller");
      }
    });

    return () => window.removeEventListener("resize", checkViewport);
  }, []);

  // During initial hydration / mount, render sleek loading skeleton inside cockpit
  if (isMobile === null || userRole === null) {
    return <CallerCockpitSkeleton />;
  }

  // Forking principle (Zero media-query hiding):
  // 1. Mobile Caller -> New Designer 2 Caller Cockpit (5 screens)
  // 2. Mobile Admin/Manager Mirror -> Same Caller Cockpit in readOnly mode
  // 3. Desktop (any role) -> Existing dense DesktopQueue
  const isCaller = userRole === "caller";
  const isMirroring = Boolean(impersonateParam);

  if (isCaller && isMobile) {
    return <CallerCockpit />;
  }

  if (isMirroring && isMobile) {
    return <CallerCockpit readOnly />;
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
