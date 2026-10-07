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

  // Page title and subtitle mapping (Team Roster is the child page of parent section Team Center)
  let pageTitle = "Team Roster";
  let pageSubtitle = "Who's working, who's stuck, and where to intervene.";

  if (isQuarantine) {
    pageTitle = "Quarantine Bin";
    pageSubtitle = "Leads rejected by callers or quarantined after exhausted attempts.";
  } else if (isInvites) {
    pageTitle = "Invites";
    pageSubtitle = "Issue single-use seat invitations. Direct signups are strictly restricted.";
  } else if (isIngestion) {
    pageTitle = "Import Leads";
    pageSubtitle = "Upload and validate lead CSV files for distribution into active dial queues.";
  }

  // Fetch quarantine count for badge indicator across all tabs
  useEffect(() => {
    let isMounted = true;
    async function fetchCount() {
      try {
        const res = await fetch("/api/manager/team-stats?range=today");
        if (res.ok) {
          const data = await res.json();
          if (isMounted && typeof data.quarantine_count === "number") {
            setQuarantineCount(data.quarantine_count);
          }
        }
      } catch {
        // Fallback or silent catch
      }
    }
    fetchCount();
    return () => {
      isMounted = false;
    };
  }, [pathname]);

  const subNavTabs = [
    {
      label: "Team Roster",
      href: "/studio/manager/team",
      icon: Users,
      isActive: isTeam,
    },
    {
      label: "Quarantine Bin",
      href: "/studio/manager/quarantine",
      icon: ShieldAlert,
      isActive: isQuarantine,
      badge: quarantineCount > 0 ? (
        <span
          className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-mono border font-bold ${
            isQuarantine
              ? "bg-[#F95721]/15 text-[#F95721] border-[#F95721]/30"
              : "bg-red-500/10 text-red-500 border-red-500/20"
          }`}
        >
          {quarantineCount}
        </span>
      ) : null,
    },
    {
      label: "Invites",
      href: "/studio/manager/invites",
      icon: Mail,
      isActive: isInvites,
    },
    {
      label: "Import Leads",
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
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono tracking-widest uppercase text-[#F95721] font-bold">
              TEAM COMMAND CENTER
            </span>
            <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/5 border border-[#ECE8E1] dark:border-[#262420] text-[#8A8680]">
              IST (UTC+5:30)
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#111110] dark:text-[#F5F3EF] tracking-tight mt-1">
            {pageTitle}
          </h1>
          <p className="text-xs text-[#6E6B66] dark:text-[#8A8680] mt-1">
            {pageSubtitle}
          </p>
        </div>

        {/* Persistent Sub-nav tabs: Team Roster · Quarantine Bin · Invites · Import Leads */}
        <div className="flex items-center gap-1 p-1 bg-black/5 dark:bg-white/5 rounded-2xl border border-[#ECE8E1] dark:border-[#262420] shrink-0 self-start md:self-auto overflow-x-auto max-w-full">
          {subNavTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = tab.isActive;

            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs transition-all shrink-0 relative rounded-xl ${
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
                {tab.badge}
                {/* Active Orange Underline */}
                {isActive && (
                  <span className="absolute bottom-0 left-2.5 right-2.5 h-[2px] bg-[#F95721] rounded-full" />
                )}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Render Current Route Page Content */}
      <div className="w-full">
        {children}
      </div>
    </div>
  );
}
