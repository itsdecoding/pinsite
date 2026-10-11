"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import Link from "next/link";
import { AlertTriangle, Loader2 } from "lucide-react";

interface FleetPipeline {
  dial_now: number;
  callbacks: number;
  overdue_callbacks: number;
  waiting: number;
  done_today: number;
}

interface NeedsAttentionItem {
  id: string;
  type: "overdue_callbacks" | "zero_dials" | "imbalance";
  caller_id?: string;
  caller_name?: string;
  count?: number;
  message: string;
  action_label: string;
}

interface LiveActivityEvent {
  id: string;
  caller_name: string;
  outcome: string;
  business: string;
  called_at: string;
}

interface TeamStatsResponse {
  summary?: {
    fleet_pipeline?: FleetPipeline;
    needs_attention?: NeedsAttentionItem[];
  };
  live_activity?: LiveActivityEvent[];
}

function formatHeaderDateTime(date: Date): string {
  try {
    const parts = new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).formatToParts(date);

    const weekday = parts.find((p) => p.type === "weekday")?.value || "";
    const day = parts.find((p) => p.type === "day")?.value || "";
    const month = parts.find((p) => p.type === "month")?.value || "";
    const hour = parts.find((p) => p.type === "hour")?.value || "";
    const minute = parts.find((p) => p.type === "minute")?.value || "";
    const dayPeriod = parts.find((p) => p.type === "dayPeriod")?.value?.toUpperCase() || "";

    return `${weekday}, ${day} ${month} · ${hour}:${minute} ${dayPeriod} IST`;
  } catch {
    return date.toLocaleString();
  }
}

function formatTimeAgo(isoString: string): string {
  if (!isoString) return "";
  const d = new Date(isoString);
  const now = Date.now();
  const diffSec = Math.max(0, Math.round((now - d.getTime()) / 1000));
  if (diffSec < 60) return `${Math.max(1, diffSec)}s ago`;
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatOutcome(outcome: string): string {
  const map: Record<string, string> = {
    interested: "Interested",
    callback: "Callback",
    no_answer: "No Answer",
    gatekeeper: "Gatekeeper",
    dm_reached: "DM Reached",
    not_interested: "Not Interested",
    dnc: "DNC",
    closed_won: "Closed Won",
    closed_lost: "Closed Lost",
  };
  return map[outcome] || outcome.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function getOutcomeDotColor(outcome: string): string {
  switch (outcome) {
    case "interested":
    case "closed_won":
      return "bg-emerald-500";
    case "callback":
    case "dm_reached":
      return "bg-[#F95721]";
    case "not_interested":
    case "closed_lost":
    case "dnc":
      return "bg-rose-500";
    case "no_answer":
    case "gatekeeper":
    default:
      return "bg-zinc-400 dark:bg-zinc-500";
  }
}

export default function ManagerDashboardPage() {
  const [pipeline, setPipeline] = useState<FleetPipeline>({
    dial_now: 0,
    callbacks: 0,
    overdue_callbacks: 0,
    waiting: 0,
    done_today: 0,
  });
  const [needsAttention, setNeedsAttention] = useState<NeedsAttentionItem[]>([]);
  const [liveActivity, setLiveActivity] = useState<LiveActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [showAllAttention, setShowAllAttention] = useState(false);

  // Set and keep date & time ticking smoothly
  useEffect(() => {
    setCurrentTime(new Date());
    const clockTimer = setInterval(() => setCurrentTime(new Date()), 30000);
    return () => clearInterval(clockTimer);
  }, []);

  const loadDashboardData = useCallback(async () => {
    try {
      const res = await fetch("/api/manager/team-stats?range=today");
      if (res.ok) {
        const data: TeamStatsResponse = await res.json();
        if (data.summary?.fleet_pipeline) {
          setPipeline(data.summary.fleet_pipeline);
        }
        if (Array.isArray(data.summary?.needs_attention)) {
          setNeedsAttention(data.summary.needs_attention);
        }
        if (Array.isArray(data.live_activity)) {
          setLiveActivity(data.live_activity);
        }
      }
    } catch (err) {
      console.warn("Failed to load dashboard data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardData();
    // Auto refresh every 30 seconds for live telemetry
    const refreshTimer = setInterval(loadDashboardData, 30000);
    return () => clearInterval(refreshTimer);
  }, [loadDashboardData]);

  const formattedSubtitle = useMemo(() => {
    if (!currentTime) return "Wed, 12 Oct · 4:18 PM IST";
    return formatHeaderDateTime(currentTime);
  }, [currentTime]);

  const displayedNeedsAttention = useMemo(() => {
    if (showAllAttention) return needsAttention;
    return needsAttention.slice(0, 3);
  }, [needsAttention, showAllAttention]);

  return (
    <div className="max-w-2xl mx-auto space-y-5 px-3 sm:px-0 py-3 sm:py-5">
      {/* 1. Header */}
      <div className="space-y-1">
        <span className="text-[10px] font-mono tracking-widest uppercase text-[#9F5639] font-bold">
          TODAY
        </span>
        <h1 className="text-3xl sm:text-4xl font-black text-[#111110] dark:text-[#F5F3EF] tracking-tight">
          Dashboard
        </h1>
        <p suppressHydrationWarning className="text-xs font-mono text-[#6E6B66] dark:text-[#8A8680] pt-0.5">
          {formattedSubtitle}
        </p>
      </div>

      {/* 2. FLEET PIPELINE CARD */}
      <div className="p-5 sm:p-6 rounded-3xl bg-white dark:bg-[#131414] border border-[#ECE8E1] dark:border-[#222222] shadow-sm">
        <div className="pb-3 border-b border-[#ECE8E1]/80 dark:border-[#222222]">
          <span className="text-[10px] font-mono tracking-widest uppercase text-[#9F5639] font-bold">
            FLEET PIPELINE
          </span>
        </div>

        <div className="divide-y divide-[#ECE8E1]/80 dark:divide-[#222222] pt-1">
          {/* Row 1: Dial Now */}
          <Link
            href="/studio/queue?tab=dialNow"
            className="py-3 flex items-center justify-between hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors rounded-xl px-2 -mx-2 group"
          >
            <span className="text-sm font-medium text-[#111110] dark:text-[#F5F3EF] group-hover:text-[#F95721] transition-colors">
              Dial Now
            </span>
            <span className="text-sm font-mono font-bold text-[#111110] dark:text-[#F5F3EF]">
              {loading ? "..." : pipeline.dial_now}
            </span>
          </Link>

          {/* Row 2: Callbacks */}
          <Link
            href="/studio/queue?tab=callbacks"
            className="py-3 flex items-center justify-between hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors rounded-xl px-2 -mx-2 group"
          >
            <span className="text-sm font-medium text-[#111110] dark:text-[#F5F3EF] group-hover:text-[#F95721] transition-colors">
              Callbacks
            </span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono font-bold text-[#111110] dark:text-[#F5F3EF]">
                {loading ? "..." : pipeline.callbacks}
              </span>
              {pipeline.overdue_callbacks > 0 && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold bg-amber-500/15 dark:bg-[#B36B28]/20 text-amber-600 dark:text-[#D9822B] border border-amber-500/30 dark:border-[#B36B28]/40">
                  <span>⚠️</span>
                  <span>{pipeline.overdue_callbacks} overdue</span>
                </span>
              )}
            </div>
          </Link>

          {/* Row 3: Waiting */}
          <Link
            href="/studio/queue?tab=waiting"
            className="py-3 flex items-center justify-between hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors rounded-xl px-2 -mx-2 group"
          >
            <span className="text-sm font-medium text-[#111110] dark:text-[#F5F3EF] group-hover:text-[#F95721] transition-colors">
              Waiting
            </span>
            <span className="text-sm font-mono font-bold text-[#111110] dark:text-[#F5F3EF]">
              {loading ? "..." : pipeline.waiting}
            </span>
          </Link>

          {/* Row 4: Done Today */}
          <Link
            href="/studio/queue?tab=done"
            className="py-3 flex items-center justify-between hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors rounded-xl px-2 -mx-2 group"
          >
            <span className="text-sm font-medium text-[#111110] dark:text-[#F5F3EF] group-hover:text-[#F95721] transition-colors">
              Done Today
            </span>
            <span className="text-sm font-mono font-bold text-emerald-600 dark:text-[#589F7A]">
              {loading ? "..." : pipeline.done_today}
            </span>
          </Link>
        </div>
      </div>

      {/* 3. NEEDS ATTENTION CARD (Only shows if there are items) */}
      {needsAttention.length > 0 && (
        <div className="p-5 sm:p-6 rounded-3xl bg-white dark:bg-[#131414] border border-[#ECE8E1] dark:border-[#222222] shadow-sm animate-in fade-in">
          <div className="pb-3 border-b border-[#ECE8E1]/80 dark:border-[#222222] flex items-center justify-between">
            <span className="text-[10px] font-mono tracking-widest uppercase text-amber-600 dark:text-amber-400 font-bold">
              NEEDS ATTENTION ({needsAttention.length})
            </span>
          </div>

          <div className="divide-y divide-[#ECE8E1]/60 dark:divide-[#222222] pt-1">
            {displayedNeedsAttention.map((item) => {
              const issueLabel =
                item.type === "overdue_callbacks"
                  ? `${item.count || 1} callback${(item.count || 1) > 1 ? "s" : ""} overdue`
                  : item.type === "zero_dials"
                  ? `${item.caller_name || "Caller"} has 0 dials today`
                  : item.message;

              const whoLabel =
                item.type === "overdue_callbacks" && item.caller_name ? item.caller_name : "";

              return (
                <div
                  key={item.id}
                  className="py-2.5 first:pt-2 last:pb-2 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-amber-500 shrink-0">⚠️</span>
                    <p className="truncate text-[#111110] dark:text-[#F5F3EF] font-medium">
                      {issueLabel}
                      {whoLabel ? (
                        <>
                          <span className="text-[#6E6B66] dark:text-[#8A8680] mx-1">·</span>
                          <span className="text-[#6E6B66] dark:text-[#8A8680]">{whoLabel}</span>
                        </>
                      ) : null}
                    </p>
                  </div>

                  <Link
                    href={
                      item.caller_id
                        ? `/studio/queue?impersonate=${item.caller_id}`
                        : "/studio/manager/team"
                    }
                    className="text-xs font-semibold text-[#F95721] hover:underline shrink-0"
                  >
                    Review ›
                  </Link>
                </div>
              );
            })}
          </div>

          {/* View all N › at bottom if > 3 items */}
          {needsAttention.length > 3 && !showAllAttention && (
            <div className="pt-3 border-t border-[#ECE8E1]/60 dark:border-[#222222] mt-1">
              <button
                type="button"
                onClick={() => setShowAllAttention(true)}
                className="text-xs font-bold text-[#F95721] hover:underline inline-flex items-center gap-1"
              >
                View all {needsAttention.length} ›
              </button>
            </div>
          )}
        </div>
      )}

      {/* 4. LIVE ACTIVITY CARD */}
      <div className="p-5 sm:p-6 rounded-3xl bg-white dark:bg-[#131414] border border-[#ECE8E1] dark:border-[#222222] shadow-sm">
        <div className="pb-3 border-b border-[#ECE8E1]/80 dark:border-[#222222]">
          <span className="text-[10px] font-mono tracking-widest uppercase text-[#9F5639] font-bold">
            LIVE ACTIVITY
          </span>
        </div>

        {loading ? (
          <div className="py-6 flex items-center justify-center text-[#6E6B66] dark:text-[#8A8680] text-xs">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            <span>Loading telemetry...</span>
          </div>
        ) : liveActivity.length === 0 ? (
          <div className="py-6 text-center text-xs text-[#6E6B66] dark:text-[#8A8680]">
            No activity logged yet today.
          </div>
        ) : (
          <div className="divide-y divide-[#ECE8E1]/60 dark:divide-[#222222] pt-1">
            {liveActivity.map((event) => (
              <div key={event.id} className="py-2.5 first:pt-2 last:pb-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-[#111110] dark:text-[#F5F3EF]">
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${getOutcomeDotColor(
                      event.outcome
                    )}`}
                  />
                  <span className="truncate">{event.caller_name}</span>
                  <span className="text-[#6E6B66] dark:text-[#8A8680] font-normal">&rarr;</span>
                  <span className="truncate font-medium">{formatOutcome(event.outcome)}</span>
                </div>
                <div className="pl-3.5 text-[11px] text-[#6E6B66] dark:text-[#8A8680] mt-0.5 truncate flex items-center gap-1.5">
                  <span className="truncate">{event.business}</span>
                  <span className="shrink-0">&bull;</span>
                  <span className="shrink-0 font-mono">{formatTimeAgo(event.called_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
