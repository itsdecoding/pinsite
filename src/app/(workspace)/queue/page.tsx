"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { DesktopQueue } from "@/components/queue/DesktopQueue";
import { MobileQueue } from "@/components/queue/MobileQueue";

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

  // During initial hydration / mount, render sleek loading state
  if (isMobile === null || userRole === null) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-[#6E6B66] dark:text-[#8A8680]">
        <Loader2 className="w-8 h-8 animate-spin text-[#F95721]" />
        <p className="text-xs font-mono uppercase tracking-wider">Syncing Outbound Deck...</p>
      </div>
    );
  }

  // Forking principle:
  // If (role === 'caller' || impersonating caller) AND viewport < 768px -> Mobile Cockpit
  // Otherwise (Desktop 1440px for caller, manager, admin) -> Dense Desktop Deck
  const isCallerMode = userRole === "caller" || Boolean(impersonateParam);
  if (isCallerMode && isMobile) {
    return <MobileQueue />;
  }

  return <DesktopQueue />;
}

export default function QueuePage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-[#6E6B66] dark:text-[#8A8680]">
          <Loader2 className="w-8 h-8 animate-spin text-[#F95721]" />
          <p className="text-xs font-mono uppercase tracking-wider">Syncing Outbound Deck...</p>
        </div>
      }
    >
      <QueueEntry />
    </Suspense>
  );
}
