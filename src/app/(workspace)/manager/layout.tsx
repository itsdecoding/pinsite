"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, ShieldAlert, Mail, UploadCloud } from "lucide-react";

interface ManagerLayoutProps {
  children: React.ReactNode;
}

export default function ManagerLayout({ children }: ManagerLayoutProps) {
  const pathname = usePathname() || "";
  const [quarantineCount, setQuarantineCount] = useState<number>(0);

  // Identify active tab based on current pathname
  const isQuarantine = pathname.includes("/quarantine");
  const isInvites = pathname.includes("/invites");
  const isIngestion = pathname.includes("/ingestion");
  const isTeam = !isQuarantine && !isInvites && !isIngestion; // default to team roster

  // Page title mapping (Content OS standard: context label + bold title, no descriptive subtitles)
  let pageTitle = "Roster";

  if (isQuarantine) {
    pageTitle = "Quarantine";
  } else if (isInvites) {
    pageTitle = "Invites";
  } else if (isIngestion) {
    pageTitle = "Import";
  }

  // Fetch quarantine count for badge indicator across tabs (lightweight count query)
  useEffect(() => {
    let isMounted = true;
    async function fetchCount() {
      try {
        const res = await fetch("/api/manager/quarantine?count_only=true");
        if (res.ok) {
          const data = await res.json();
          if (isMounted && typeof data.count === "number") {
            setQuarantineCount(data.count);
          }
        }
      } catch {
        // Fallback or silent catch
      }
    }
    fetchCount();
    const interval = setInterval(fetchCount, 60000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isQuarantine]);

  const subNavTabs = [
    {
      label: "Roster",
      href: "/studio/manager/team",
      icon: Users,
      isActive: isTeam,
    },
    {
      label: quarantineCount > 0 ? `Quarantine·${quarantineCount}` : "Quarantine",
      href: "/studio/manager/quarantine",
      icon: ShieldAlert,
      isActive: isQuarantine,
    },
    {
      label: "Invites",
      href: "/studio/manager/invites",
      icon: Mail,
      isActive: isInvites,
    },
    {
      label: "Import",
      href: "/studio/manager/ingestion",
      icon: UploadCloud,
      isActive: isIngestion,
    },
  ];

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6 pb-16">
      {/* ========================================================================= */}
      {/* SHARED MANAGER SHELL: Standardized Header & Persistent Sub-Navigation    */}
      {/* ========================================================================= */}
      <div className="pb-4 border-b border-[#ECE8E1] dark:border-[#262420] pt-2 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <span className="text-[11px] font-bold tracking-[0.15em] uppercase text-[#8A8680] block">
            COMMAND CENTER
          </span>
          <h1 className="text-3xl sm:text-4xl font-extrabold sm:font-black text-[#111110] dark:text-[#F5F3EF] tracking-tight mt-0.5">
            {pageTitle}
          </h1>
        </div>

        {/* Persistent Sub-nav tabs: [Roster] [Quarantine·51] [Invites] [Import] with fade edges */}
        <div className="relative w-full md:w-auto shrink-0 -mx-4 px-4 sm:mx-0 sm:px-0">
          <div className="pointer-events-none absolute left-3 top-0 bottom-0 w-3 bg-gradient-to-r from-stone-50 dark:from-[#0d0e0e] to-transparent z-10 md:hidden" />
          <div className="pointer-events-none absolute right-3 top-0 bottom-0 w-6 bg-gradient-to-l from-stone-50 dark:from-[#0d0e0e] to-transparent z-10 md:hidden flex items-center justify-end pr-0.5">
            <span className="text-[10px] text-[#8A8680]/60 font-mono">›</span>
          </div>

          <div className="flex items-center gap-1 p-1 bg-black/5 dark:bg-white/5 rounded-2xl border border-[#ECE8E1] dark:border-[#262420] overflow-x-auto no-scrollbar scroll-smooth w-full md:w-auto">
            {subNavTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = tab.isActive;

              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs transition-all shrink-0 whitespace-nowrap relative rounded-xl ${
                    isActive
                      ? "font-bold text-[#111110] dark:text-[#F5F3EF] bg-white dark:bg-[#181715] shadow-sm"
                      : "font-medium text-[#6E6B66] dark:text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF]"
                  }`}
                >
                  <Icon
                    className={`w-3.5 h-3.5 ${
                      isActive ? "text-[#F95721] stroke-[2.2]" : "text-[#8A8680]"
                    }`}
                  />
                  <span>{tab.label}</span>
                  {isActive && (
                    <span className="absolute bottom-0 left-2.5 right-2.5 h-[2px] bg-[#F95721] rounded-full" />
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* Render Current Route Page Content */}
      <div className="w-full">
        {children}
      </div>
    </div>
  );
}
