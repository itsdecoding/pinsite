"use client";

import React, { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { useUserSession } from "@/contexts/UserSessionContext";
import { NotificationBell } from "@/components/comms/NotificationBell";

export function MobileTopBar() {
  const pathname = usePathname();
  const { user, profile } = useUserSession();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const cachedRole = React.useMemo(() => {
    if (typeof window !== "undefined") {
      try {
        return (
          localStorage.getItem("agency_user_role") ||
          (document.cookie.match(/agency_cached_role=([^;]+)/)?.[1] ?? null) ||
          (document.cookie.match(/agency_demo_role=([^;]+)/)?.[1] ?? null)
        );
      } catch {}
    }
    return null;
  }, []);

  const role = React.useMemo(() => {
    const rawRole =
      profile?.role ||
      cachedRole ||
      (user?.user_metadata?.role as string) ||
      (user?.app_metadata?.role as string);

    if (rawRole) return rawRole.toLowerCase();
    if (pathname.includes("/manager") || pathname.includes("/dashboard")) return "admin";
    if (pathname.includes("/queue")) return "caller";
    if (pathname.includes("/projects")) return "developer";
    return "admin";
  }, [profile?.role, cachedRole, user, pathname]);

  const isManagerOrAdmin = role === "admin" || role === "manager" || role === "owner";

  const pageTitle = React.useMemo(() => {
    if (pathname.includes("/dashboard")) return "Dashboard";
    if (pathname.includes("/queue")) return "Dial Queue";
    if (pathname.includes("/projects")) return "Projects";
    if (pathname.includes("/comms")) return "Comms & DMs";
    if (pathname.includes("/manager/team")) return "Team Center";
    if (pathname.includes("/manager/ingestion")) return "Import Leads";
    if (pathname.includes("/manager/quarantine")) return "Quarantine";
    if (pathname.includes("/manager/invites")) return "Team Invites";
    return "Team Center";
  }, [pathname]);

  if (!mounted || !isManagerOrAdmin) {
    return null;
  }

  const handleOpenDrawer = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("open-mobile-drawer"));
    }
  };

  const handleOpenProfile = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("open-mobile-profile"));
    }
  };

  return (
    <header className="lg:hidden sticky top-0 z-30 w-full bg-white/90 dark:bg-[#111213]/95 backdrop-blur-2xl border-b border-black/[0.08] dark:border-white/[0.12] px-4 py-2.5 flex items-center justify-between shadow-xs transition-all">
      {/* Left: Hamburger ☰ */}
      <button
        type="button"
        onClick={handleOpenDrawer}
        aria-label="Open navigation drawer"
        className="p-2 -ml-2 rounded-xl text-zinc-700 dark:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/10 active:scale-95 transition"
      >
        <Menu className="w-5 h-5 stroke-[2.2]" />
      </button>

      {/* Center / Left: Page title */}
      <div className="flex-1 min-w-0 px-3 flex items-center gap-2">
        <h1 className="text-base font-black text-[#111110] dark:text-[#F5F3EF] truncate tracking-tight">
          {pageTitle}
        </h1>
        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#F95721] px-1.5 py-0.5 rounded-md bg-[#F95721]/10 border border-[#F95721]/20 shrink-0">
          {role}
        </span>
      </div>

      {/* Right: Notification bell + Profile avatar */}
      <div className="flex items-center gap-2 shrink-0">
        <NotificationBell dropdownAlign="down" />

        <button
          type="button"
          onClick={handleOpenProfile}
          aria-label="Open profile settings"
          className="w-8 h-8 rounded-full bg-[#7F3922]/20 border border-[#7F3922]/40 text-[#F95721] font-bold text-xs flex items-center justify-center shrink-0 active:scale-95 transition hover:opacity-90"
        >
          {(profile?.full_name || user?.email || "U").charAt(0).toUpperCase()}
        </button>
      </div>
    </header>
  );
}
