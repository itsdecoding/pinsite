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
  const isTeam = !isQuarantine && !isInvites && !isIngestion; // default to team center

  // Page title and subtitle mapping
  let pageTitle = "Team Center";
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

  return (
    <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6 pb-16">
      {/* ========================================================================= */}
      {/* SHARED MANAGER SHELL: Standardized Header & Persistent Sub-Navigation    */}
      {/* ========================================================================= */}
      <div className="pb-4 border-b border-[#ECE8E1] dark:border-[#55514B] pt-2 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono tracking-widest uppercase text-[#9F5639] font-bold">
              TEAM COMMAND CENTER
            </span>
            <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-black/5 dark:bg-[#131414] border border-[#ECE8E1] dark:border-[#55514B] text-[#8A8680]">
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

        {/* Persistent Sub-nav tabs on EVERY /manager/* route */}
        <div className="flex items-center gap-1.5 p-1 bg-black/5 dark:bg-[#131414] rounded-2xl border border-[#ECE8E1] dark:border-[#55514B] shrink-0 self-start md:self-auto overflow-x-auto max-w-full">
          <Link
            href="/studio/manager/team"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs transition-all shrink-0 ${
              isTeam
                ? "font-semibold bg-[#7F3922] text-white shadow-sm border border-[#A6543A] ring-1 ring-[#A6543A]/40"
                : "font-medium text-[#6E6B66] dark:text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF]"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Team Center</span>
          </Link>

          <Link
            href="/studio/manager/quarantine"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs transition-all shrink-0 ${
              isQuarantine
                ? "font-semibold bg-[#7F3922] text-white shadow-sm border border-[#A6543A] ring-1 ring-[#A6543A]/40"
                : "font-medium text-[#6E6B66] dark:text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF]"
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Quarantine Bin</span>
            {quarantineCount > 0 && (
              <span
                className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-mono border font-bold ${
                  isQuarantine
                    ? "bg-white/20 text-white border-white/30"
                    : "bg-red-500/10 text-red-500 border-red-500/20"
                }`}
              >
                {quarantineCount}
              </span>
            )}
          </Link>

          <Link
            href="/studio/manager/invites"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs transition-all shrink-0 ${
              isInvites
                ? "font-semibold bg-[#7F3922] text-white shadow-sm border border-[#A6543A] ring-1 ring-[#A6543A]/40"
                : "font-medium text-[#6E6B66] dark:text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF]"
            }`}
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Invites</span>
          </Link>

          <Link
            href="/studio/manager/ingestion"
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs transition-all shrink-0 ${
              isIngestion
                ? "font-semibold bg-[#7F3922] text-white shadow-sm border border-[#A6543A] ring-1 ring-[#A6543A]/40"
                : "font-medium text-[#6E6B66] dark:text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF]"
            }`}
          >
            <UploadCloud className="w-3.5 h-3.5" />
            <span>Import Leads</span>
          </Link>
        </div>
      </div>

      {/* Render Current Route Page Content */}
      <div className="w-full">
        {children}
      </div>
    </div>
  );
}
