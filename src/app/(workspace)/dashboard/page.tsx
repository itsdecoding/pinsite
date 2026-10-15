"use client";

import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import Link from "next/link";
import {
  Flame,
  PhoneCall,
  CheckCircle2,
  TrendingUp,
  ExternalLink,
  Phone,
  Copy,
  Check,
  ChevronRight,
  Users,
  Target,
  BarChart3,
  Layers,
  ArrowRight,
  Clock,
  Loader2,
  Crown,
} from "lucide-react";
import { ScraperTriggerCard } from "@/components/scraper/ScraperTriggerCard";

interface Snapshot {
  warm_in_play: number;
  closed_won: number;
  closed_revenue_inr: number;
  estimated_pipeline_inr: number;
  fleet_dials_in_range: number;
  all_time_fleet_dials: number;
  agency_close_rate: number;
  contact_to_interested_rate?: number;
}

interface InterestedProspect {
  id: string;
  name: string;
  phone: string;
  niche: string;
  area: string;
  score: number;
  status: string;
  escalated_at: string;
  caller_name: string;
  caller_id?: string;
  estimated_value_inr?: number;
}

interface CallerPerformance {
  id: string;
  name: string;
  role: string;
  active: boolean;
  total_dials: number;
  connects: number;
  interested: number;
  closed_won: number;
  close_rate: number;
  connect_rate: number;
  avg_talk_seconds: number;
}

interface NicheBreakdown {
  niche: string;
  total_leads: number;
  dials: number;
  interested: number;
  close_rate: number;
}

interface Funnel {
  total_leads: number;
  dialed: number;
  total_dials: number;
  no_answer: number;
  connected: number;
  rejected: number;
  callbacks: number;
  interested: number;
  closed_won: number;
}

interface WeeklyTrendItem {
  label: string;
  date_range: string;
  dials: number;
  connects: number;
  interested: number;
}

interface DashboardInsightsResponse {
  range: string;
  range_label: string;
  snapshot: Snapshot;
  interested_prospects: InterestedProspect[];
  caller_performance: CallerPerformance[];
  niche_breakdown: NicheBreakdown[];
  funnel: Funnel;
  weekly_trend?: WeeklyTrendItem[];
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

function formatCurrencyINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDisplayPhone(rawPhone: string): string {
  if (!rawPhone) return "";
  const cleaned = rawPhone.replace(/\D/g, "");
  if (cleaned.length === 10) {
    return `+91 ${cleaned.slice(0, 5)} ${cleaned.slice(5)}`;
  }
  if (cleaned.length === 11 && cleaned.startsWith("0")) {
    const num = cleaned.slice(1);
    return `+91 ${num.slice(0, 5)} ${num.slice(5)}`;
  }
  if (cleaned.length === 12 && cleaned.startsWith("91")) {
    const num = cleaned.slice(2);
    return `+91 ${num.slice(0, 5)} ${num.slice(5)}`;
  }
  return rawPhone;
}

function formatShortDate(range: string): string {
  if (!range) return "";
  const m = range.match(/(\d+)\s+([A-Za-z]+)\s*-\s*(\d+)\s+([A-Za-z]+)/);
  if (m) {
    const d1 = parseInt(m[1], 10);
    const m1 = m[2].slice(0, 3);
    const d2 = parseInt(m[3], 10);
    const m2 = m[4].slice(0, 3);
    if (m1 === m2) {
      return `${d1}–${d2} ${m1}`;
    }
    return `${d1} ${m1}–${d2} ${m2}`;
  }
  return range.replace(/Sept/g, "Sep").replace(/\s*-\s*/, "–");
}

function getRoleDotColor(role?: string) {
  const r = (role || "").toLowerCase();
  if (r === "manager" || r === "admin") {
    return {
      bg: "#8B5CF6", // Purple
      text: "#FFFFFF",
      label: "Manager / Admin",
    };
  }
  if (r === "dev" || r === "developer") {
    return {
      bg: "#0284C7", // Sky blue
      text: "#FFFFFF",
      label: "Developer",
    };
  }
  return {
    bg: "#F95721", // Flame Orange
    text: "#FFFFFF",
    label: "Caller",
  };
}

function getInitials(name: string): string {
  const clean = name.replace(/\s*\(admin\)/i, "").trim();
  const parts = clean.split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getShortName(name: string): string {
  const clean = name.replace(/\s*\(admin\)/i, "").trim();
  return clean.split(/\s+/)[0];
}

export default function ManagerDashboardPage() {
  const [activeTab, setActiveTab] = useState<"priority" | "callers" | "pipeline">("priority");
  const [timeRange, setTimeRange] = useState<"all" | "30d" | "7d" | "today">("all");
  const [data, setData] = useState<DashboardInsightsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [selectedCaller, setSelectedCaller] = useState<CallerPerformance | null>(null);
  const [hoveredCallerId, setHoveredCallerId] = useState<string | null>(null);
  const [copiedPhoneId, setCopiedPhoneId] = useState<string | null>(null);
  const [showAllCallers, setShowAllCallers] = useState(false);
  const mobileCarouselRef = useRef<HTMLDivElement>(null);
  const [activeCarouselIndex, setActiveCarouselIndex] = useState(0);

  const handleCarouselScroll = useCallback(() => {
    const el = mobileCarouselRef.current;
    if (!el) return;
    const card = el.firstElementChild as HTMLElement | null;
    const cardWidth = card ? card.offsetWidth + 12 : el.offsetWidth * 0.86;
    const newIndex = Math.round(el.scrollLeft / cardWidth);
    setActiveCarouselIndex(newIndex);
  }, []);

  const scrollToLead = useCallback((index: number) => {
    const el = mobileCarouselRef.current;
    if (!el) return;
    const card = el.firstElementChild as HTMLElement | null;
    const cardWidth = card ? card.offsetWidth + 12 : el.offsetWidth * 0.86;
    el.scrollTo({ left: index * cardWidth, behavior: "smooth" });
    setActiveCarouselIndex(index);
  }, []);

  // Live IST Clock ticking
  useEffect(() => {
    setCurrentTime(new Date());
    const clockTimer = setInterval(() => setCurrentTime(new Date()), 30000);
    return () => clearInterval(clockTimer);
  }, []);

  const fetchInsights = useCallback(async (range: string) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/manager/dashboard-insights?range=${range}`);
      if (res.ok) {
        const json: DashboardInsightsResponse = await res.json();
        setData(json);
      }
    } catch (err) {
      console.warn("Failed to load dashboard insights:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInsights(timeRange);
    const interval = setInterval(() => fetchInsights(timeRange), 45000);
    return () => clearInterval(interval);
  }, [timeRange, fetchInsights]);

  const formattedSubtitle = useMemo(() => {
    if (!currentTime) return "Mon, 12 Oct · 10:45 PM IST";
    return formatHeaderDateTime(currentTime);
  }, [currentTime]);

  const timeRangeLabel = useMemo(() => {
    if (timeRange === "today") return "Today (IST)";
    if (timeRange === "7d") return "Last 7 Days";
    if (timeRange === "30d") return "Last 30 Days";
    return "All Time";
  }, [timeRange]);

  function handleCopyPhone(id: string, phone: string, e: React.MouseEvent) {
    e.stopPropagation();
    navigator.clipboard.writeText(phone);
    setCopiedPhoneId(id);
    setTimeout(() => setCopiedPhoneId(null), 2000);
  }

  // Scatter plot calculations
  const scatterMetrics = useMemo(() => {
    const allCallers = data?.caller_performance || [];
    const activeCallers = allCallers.filter((c) => c.total_dials > 0);

    if (activeCallers.length === 0) {
      return {
        maxX: 150,
        maxY: 30,
        xTicks: [0, 50, 100, 150],
        yTicks: [0, 10, 20, 30],
        callers: [] as CallerPerformance[],
        activeCount: 0,
        totalCount: allCallers.length,
      };
    }

    const highestDials = Math.max(...activeCallers.map((c) => c.total_dials));
    const highestRate = Math.max(...activeCallers.map((c) => c.close_rate));

    // Determine scale for X (dials)
    let maxX = 150;
    let xTicks = [0, 50, 100, 150];
    if (highestDials > 150) {
      maxX = Math.ceil((highestDials * 1.15) / 50) * 50;
      const step = maxX <= 250 ? 50 : 100;
      xTicks = [];
      for (let t = 0; t <= maxX; t += step) xTicks.push(t);
    } else if (highestDials <= 60 && highestDials > 0) {
      maxX = 80;
      xTicks = [0, 20, 40, 60, 80];
    }

    // Determine scale for Y (rate %)
    let maxY = 30;
    let yTicks = [0, 10, 20, 30];
    if (highestRate > 30) {
      maxY = Math.min(100, Math.ceil((highestRate * 1.15) / 10) * 10);
      const step = maxY <= 40 ? 10 : 20;
      yTicks = [];
      for (let t = 0; t <= maxY; t += step) {
        yTicks.push(t);
      }
      if (yTicks[yTicks.length - 1] < maxY) {
        yTicks.push(maxY);
      }
    }

    return {
      maxX,
      maxY,
      xTicks,
      yTicks,
      callers: activeCallers,
      activeCount: activeCallers.length,
      totalCount: allCallers.length,
    };
  }, [data]);

  const warmCount = data?.snapshot?.warm_in_play ?? data?.interested_prospects?.length ?? 0;
  const activeCallersCount = scatterMetrics.activeCount;

  const dashboardTabs = [
    {
      id: "priority",
      label: "Priority",
      badge: warmCount > 0 ? `🔥 ${warmCount}` : undefined,
      icon: Flame,
    },
    {
      id: "callers",
      label: "Callers",
      badge: activeCallersCount > 0 ? `${activeCallersCount} Active` : undefined,
      icon: Users,
    },
    {
      id: "pipeline",
      label: "Pipeline & Trends",
      icon: Layers,
    },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6 px-3 sm:px-6 py-3 sm:py-6 pb-20">
      {/* ========================================================================= */}
      {/* 1. HEADER & SUB-NAVIGATION (Identical to Team Center in Image 4)          */}
      {/* ========================================================================= */}
      <div className="pb-4 border-b border-[#ECE8E1] dark:border-[#262420] pt-1 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <span className="text-[11px] font-bold tracking-[0.15em] uppercase text-[#8A8680] block">
            COMMAND CENTER
          </span>
          <h1 className="text-3xl sm:text-4xl font-extrabold sm:font-black text-[#111110] dark:text-[#F5F3EF] tracking-tight mt-0.5">
            Dashboard
          </h1>
          <p suppressHydrationWarning className="text-xs font-mono text-[#6E6B66] dark:text-[#8A8680] pt-0.5">
            {formattedSubtitle}
          </p>
        </div>

        {/* Persistent Sub-nav tabs: [Priority · 2] [Callers · 4] [Pipeline] [Trends] [All] with fade edges */}
        <div className="relative w-full md:w-auto shrink-0 -mx-3 px-3 sm:mx-0 sm:px-0">
          <div className="pointer-events-none absolute left-3 top-0 bottom-0 w-3 bg-gradient-to-r from-stone-50 dark:from-[#0d0e0e] to-transparent z-10 md:hidden" />
          <div className="pointer-events-none absolute right-3 top-0 bottom-0 w-6 bg-gradient-to-l from-stone-50 dark:from-[#0d0e0e] to-transparent z-10 md:hidden flex items-center justify-end pr-0.5">
            <span className="text-[10px] text-[#8A8680]/60 font-mono">›</span>
          </div>

          <div className="flex items-center gap-1 p-1 bg-black/5 dark:bg-white/5 rounded-2xl border border-[#ECE8E1] dark:border-[#262420] overflow-x-auto no-scrollbar scroll-smooth w-full md:w-auto">
            {dashboardTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id as any)}
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
                  {tab.badge && (
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[9px] font-mono font-bold ${
                        isActive
                          ? "bg-[#F95721]/15 text-[#F95721]"
                          : "bg-black/5 dark:bg-white/10 text-[#8A8680]"
                      }`}
                    >
                      {tab.badge}
                    </span>
                  )}
                  {isActive && (
                    <span className="absolute bottom-0 left-2.5 right-2.5 h-[2px] bg-[#F95721] rounded-full" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Day 1 Empty State Alert when zero dials logged yet */}
      {!loading && (!data?.snapshot?.all_time_fleet_dials || data.snapshot.all_time_fleet_dials === 0) && (
        <div className="p-4 sm:p-5 rounded-2xl bg-amber-500/[0.06] border border-amber-500/20 text-[#111110] dark:text-[#F5F3EF] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold text-sm shrink-0">
              🚀
            </div>
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 font-mono">
                DAY 1: READY TO LAUNCH FLEET
              </h4>
              <p className="text-xs text-[#6E6B66] dark:text-[#8A8680] mt-0.5">
                No dials logged yet. Once callers begin outbound outreach in the Dial Queue, live volume, quadrant scatter plots, and conversion funnel drop-offs will plot here automatically.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/studio/queue"
              className="px-3 py-1.5 rounded-xl bg-[#F95721] text-white text-xs font-bold hover:bg-[#E04612] transition-colors"
            >
              Open Dial Queue
            </Link>
            <Link
              href="/studio/manager/team"
              className="px-3 py-1.5 rounded-xl bg-black/5 dark:bg-white/5 border border-[#ECE8E1] dark:border-white/10 text-xs font-semibold hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
            >
              Team Center
            </Link>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2 & 3. PRIORITY SECTION (Revenue Snapshot + Interested Leads to Close)     */}
      {/* ========================================================================= */}
      {activeTab === "priority" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Mobile Compact 4-Column Row (Matches Team Center Fleet Pipeline height: ~75px) */}
          <div className="md:hidden p-3.5 rounded-2xl bg-white dark:bg-[#131414] border border-[#ECE8E1] dark:border-white/10 shadow-sm space-y-2.5">
        <div className="flex items-center justify-between pb-2 border-b border-[#ECE8E1]/80 dark:border-white/10">
          <span className="text-[10px] font-mono tracking-widest uppercase text-[#F95721] font-bold">
            PIPELINE & REVENUE
          </span>
          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            {formatCurrencyINR(data?.snapshot?.estimated_pipeline_inr ?? 70000)} in play
          </span>
        </div>

        <div className="grid grid-cols-4 divide-x divide-[#ECE8E1] dark:divide-white/10 text-center">
          {/* 1. Warm in Play */}
          <div className="px-1 py-0.5">
            <div className="text-xl font-black text-[#111110] dark:text-[#F5F3EF] leading-tight">
              {loading ? "..." : data?.snapshot?.warm_in_play ?? 0}
            </div>
            <div className="text-[10px] text-[#8A8680] font-mono uppercase mt-0.5 tracking-tight truncate flex items-center justify-center gap-0.5">
              <span>Warm</span>
              <span className="text-[9px]">🔥</span>
            </div>
          </div>

          {/* 2. Deals Won */}
          <div className="px-1 py-0.5">
            <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 leading-tight">
              {loading ? "..." : data?.snapshot?.closed_won ?? 0}
            </div>
            <div className="text-[10px] text-[#8A8680] font-mono uppercase mt-0.5 tracking-tight truncate flex items-center justify-center gap-0.5">
              <span>Won</span>
              <span className="text-[9px]">🏆</span>
            </div>
          </div>

          {/* 3. Fleet Volume */}
          <div className="px-1 py-0.5">
            <div className="text-xl font-black text-[#111110] dark:text-[#F5F3EF] leading-tight">
              {loading ? "..." : data?.snapshot?.all_time_fleet_dials ?? 0}
            </div>
            <div className="text-[10px] text-[#8A8680] font-mono uppercase mt-0.5 tracking-tight truncate flex items-center justify-center gap-0.5">
              <span>Dials</span>
              <span className="text-[9px]">📞</span>
            </div>
          </div>

          {/* 4. Contact -> Interested Rate */}
          <div className="px-1 py-0.5">
            <div className="text-xl font-black text-purple-600 dark:text-purple-400 leading-tight">
              {loading ? "..." : `${data?.snapshot?.contact_to_interested_rate ?? data?.snapshot?.agency_close_rate ?? 0}%`}
            </div>
            <div className="text-[10px] text-[#8A8680] font-mono uppercase mt-0.5 tracking-tight truncate flex items-center justify-center gap-0.5">
              <span>Rate</span>
              <span className="text-[9px]">📈</span>
            </div>
          </div>
        </div>
      </div>

      {/* Desktop Fleet Pipeline Cards (Unchanged 4-Column Grid) */}
      <div className="hidden md:block p-5 rounded-3xl bg-white dark:bg-[#131414] border border-[#ECE8E1] dark:border-white/10 shadow-sm space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-[#ECE8E1]/80 dark:border-white/10">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono tracking-widest uppercase text-[#F95721] font-bold">
              PIPELINE & REVENUE SNAPSHOT
            </span>
          </div>
          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            {formatCurrencyINR(data?.snapshot?.estimated_pipeline_inr ?? 70000)} in play
          </span>
        </div>

        <div className="grid grid-cols-4 gap-4 pt-1">
          {/* 1. Warm in Play */}
          <div className="p-3.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.02] border border-[#ECE8E1]/80 dark:border-white/10 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono uppercase text-[#8A8680] font-semibold">
                Warm in Play
              </span>
              <Flame className="w-3.5 h-3.5 text-[#F95721]" />
            </div>
            <div className="mt-2">
              <div className="text-3xl font-black text-[#111110] dark:text-[#F5F3EF] tracking-tight">
                {loading ? "..." : data?.snapshot?.warm_in_play ?? 0}
              </div>
              <p className="text-[10px] text-[#8A8680] mt-0.5 truncate">
                High-intent prospects ready to close
              </p>
            </div>
          </div>

          {/* 2. Deals Won */}
          <div className="p-3.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.02] border border-[#ECE8E1]/80 dark:border-white/10 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono uppercase text-[#8A8680] font-semibold">
                Deals Won
              </span>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            </div>
            <div className="mt-2">
              <div className="text-3xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight">
                {loading ? "..." : data?.snapshot?.closed_won ?? 0}
              </div>
              <p className="text-[10px] text-[#8A8680] mt-0.5 truncate">
                {formatCurrencyINR(data?.snapshot?.closed_revenue_inr ?? 0)} collected
              </p>
            </div>
          </div>

          {/* 3. Total Fleet Volume (Lifetime/All-Time Dials) */}
          <div className="p-3.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.02] border border-[#ECE8E1]/80 dark:border-white/10 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono uppercase text-[#8A8680] font-semibold">
                Fleet Volume
              </span>
              <PhoneCall className="w-3.5 h-3.5 text-[#8A8680]" />
            </div>
            <div className="mt-2">
              <div className="text-3xl font-black text-[#111110] dark:text-[#F5F3EF] tracking-tight">
                {loading ? "..." : data?.snapshot?.all_time_fleet_dials ?? 0}
              </div>
              <p className="text-[10px] text-[#8A8680] mt-0.5 truncate">
                Lifetime dials logged by team
              </p>
            </div>
          </div>

          {/* 4. Conversion Rate */}
          <div className="p-3.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.02] border border-[#ECE8E1]/80 dark:border-white/10 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono uppercase text-[#8A8680] font-semibold">
                Contact → Interested
              </span>
              <TrendingUp className="w-3.5 h-3.5 text-purple-500" />
            </div>
            <div className="mt-2">
              <div className="text-3xl font-black text-[#111110] dark:text-[#F5F3EF] tracking-tight">
                {loading ? "..." : `${data?.snapshot?.contact_to_interested_rate ?? data?.snapshot?.agency_close_rate ?? 0}%`}
              </div>
              <p className="text-[10px] text-[#8A8680] mt-0.5 truncate">
                {data?.snapshot?.warm_in_play ?? 0} warm from {data?.snapshot?.fleet_dials_in_range ?? 0} dials
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. INTERESTED PROSPECTS — SNEAK PEEK (1-Tap Direct Founder Closer View)    */}
      {/* ========================================================================= */}
      <div className="p-4 sm:p-5 rounded-2xl sm:rounded-3xl bg-white dark:bg-[#131414] border border-[#ECE8E1] dark:border-white/10 shadow-sm space-y-3">
        <div className="flex items-center justify-between pb-3 border-b border-[#ECE8E1]/80 dark:border-white/10">
          <div className="flex items-center gap-2">
            <span className="text-lg">🔥</span>
            <h3 className="text-base sm:text-lg font-bold text-[#111110] dark:text-[#F5F3EF] tracking-tight">
              Interested — Ready to Close{" "}
              <span className="text-[#F95721] font-mono font-extrabold text-sm sm:text-base">
                ({data?.interested_prospects?.length ?? 0})
              </span>
            </h3>
          </div>

          <Link
            href="/studio/queue?tab=callbacks"
            className="text-xs font-semibold text-[#F95721] hover:underline flex items-center gap-1 shrink-0"
          >
            <span>Dial Queue</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {loading ? (
          <div className="py-8 flex items-center justify-center text-xs text-[#8A8680] gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-[#F95721]" />
            <span>Loading interested prospects...</span>
          </div>
        ) : !data?.interested_prospects || data.interested_prospects.length === 0 ? (
          <div className="py-6 text-center space-y-1">
            <p className="text-xs font-semibold text-[#111110] dark:text-[#F5F3EF]">
              No interested prospects waiting
            </p>
            <p className="text-[11px] text-[#8A8680]">
              As callers pitch leads and mark them Interested, they appear here instantly.
            </p>
          </div>
        ) : (
          <>
            {/* Mobile Horizontal Snap-Scroll Carousel (md:hidden) */}
            <div className="md:hidden space-y-2">
              <div
                ref={mobileCarouselRef}
                onScroll={handleCarouselScroll}
                className="flex gap-3 overflow-x-auto snap-x snap-mandatory scroll-smooth pb-2 -mx-2 px-2"
                style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
              >
                {data.interested_prospects.map((lead) => (
                  <div
                    key={lead.id}
                    className="snap-start shrink-0 w-[85vw] max-w-[320px] p-3.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.03] border border-[#ECE8E1] dark:border-white/10 flex flex-col justify-between shadow-sm space-y-2"
                  >
                    <div className="space-y-1.5">
                      {/* 1. Name + money on top */}
                      <div className="flex items-baseline justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-base shrink-0">🔥</span>
                          <h4 className="text-sm font-bold text-[#111110] dark:text-[#F5F3EF] truncate">
                            {lead.name}
                          </h4>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-sm font-black text-emerald-600 dark:text-emerald-400 font-mono">
                            {formatCurrencyINR(lead.estimated_value_inr ?? 35000)}
                          </span>
                        </div>
                      </div>

                      {/* 2. Context */}
                      <p className="text-xs text-[#6E6B66] dark:text-[#8A8680] pl-6">
                        {lead.niche} &bull; {lead.area}
                      </p>

                      {/* 3. Stage + time */}
                      <p className="text-xs font-semibold text-[#F95721] pl-6">
                        Interested &bull; {formatTimeAgo(lead.escalated_at)}
                      </p>

                      {/* 4. Attribution */}
                      <p className="text-[11px] text-[#8A8680] font-mono pl-6">
                        By {lead.caller_name}
                      </p>

                      {/* 5. Phone as tappable line */}
                      <div className="pl-6 pt-0.5 flex items-center gap-2">
                        <a
                          href={`tel:${lead.phone}`}
                          className="inline-flex items-center gap-1.5 text-xs font-mono font-medium text-[#111110] dark:text-[#F5F3EF] hover:text-[#F95721] transition-colors py-0.5 group"
                        >
                          <Phone className="w-3.5 h-3.5 text-[#8A8680] group-hover:text-[#F95721]" />
                          <span className="underline decoration-[#ECE8E1] dark:decoration-white/20 underline-offset-2">
                            {formatDisplayPhone(lead.phone)}
                          </span>
                        </a>

                        <button
                          type="button"
                          onClick={(e) => handleCopyPhone(lead.id, lead.phone, e)}
                          className="p-1 rounded text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF] transition-colors"
                          title="Copy phone"
                        >
                          {copiedPhoneId === lead.id ? (
                            <Check className="w-3 h-3 text-emerald-500" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* 6. Two buttons max: Call + Open */}
                    <div className="grid grid-cols-2 gap-2 pt-1 pl-6">
                      <a
                        href={`tel:${lead.phone}`}
                        className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-[#F95721] hover:bg-[#E04612] text-white text-xs font-bold transition-all shadow-sm active:scale-95"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        <span>Call</span>
                      </a>

                      <Link
                        href={`/studio/queue?tab=callbacks&lead_id=${lead.id}`}
                        className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-[#ECE8E1] dark:border-white/10 text-[#111110] dark:text-[#F5F3EF] text-xs font-semibold transition-all active:scale-95"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-[#8A8680]" />
                        <span>Open</span>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>

              {/* Position indicator dots if > 1 lead */}
              {data.interested_prospects.length > 1 && (
                <div className="flex items-center justify-center gap-1.5 pt-1">
                  {data.interested_prospects.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => scrollToLead(i)}
                      className={`transition-all rounded-full ${
                        activeCarouselIndex === i
                          ? "w-4 h-1.5 bg-[#F95721]"
                          : "w-1.5 h-1.5 bg-black/20 dark:bg-white/20 hover:bg-black/40"
                      }`}
                      aria-label={`Jump to lead ${i + 1}`}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Desktop Vertical List (hidden md:block - Desktop remains unchanged) */}
            <div className="hidden md:block divide-y divide-[#ECE8E1]/80 dark:divide-white/10">
              {data.interested_prospects.map((lead) => (
                <div
                  key={lead.id}
                  className="py-4 space-y-1.5 first:pt-2 last:pb-2"
                >
                  {/* 1. Name + money on top (both big, meaningful) */}
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-base shrink-0">🔥</span>
                      <h4 className="text-base sm:text-lg font-bold text-[#111110] dark:text-[#F5F3EF] truncate">
                        {lead.name}
                      </h4>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-base sm:text-lg font-black text-emerald-600 dark:text-emerald-400 font-mono">
                        {formatCurrencyINR(lead.estimated_value_inr ?? 35000)}
                      </span>
                    </div>
                  </div>

                  {/* 2. Context below (niche · area) */}
                  <p className="text-xs text-[#6E6B66] dark:text-[#8A8680] pl-6">
                    {lead.niche} &bull; {lead.area}
                  </p>

                  {/* 3. Stage + time (when it moved to Interested) */}
                  <p className="text-xs font-semibold text-[#F95721] pl-6">
                    Interested &bull; {formatTimeAgo(lead.escalated_at)}
                  </p>

                  {/* 4. Attribution (muted) */}
                  <p className="text-[11px] text-[#8A8680] font-mono pl-6">
                    By {lead.caller_name}
                  </p>

                  {/* 5. Phone as tappable line */}
                  <div className="pl-6 pt-1 flex items-center gap-2">
                    <a
                      href={`tel:${lead.phone}`}
                      className="inline-flex items-center gap-1.5 text-xs font-mono font-medium text-[#111110] dark:text-[#F5F3EF] hover:text-[#F95721] transition-colors py-0.5 group"
                    >
                      <Phone className="w-3.5 h-3.5 text-[#8A8680] group-hover:text-[#F95721]" />
                      <span className="underline decoration-[#ECE8E1] dark:decoration-white/20 underline-offset-2">
                        {formatDisplayPhone(lead.phone)}
                      </span>
                    </a>

                    <button
                      type="button"
                      onClick={(e) => handleCopyPhone(lead.id, lead.phone, e)}
                      className="p-1 rounded text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF] transition-colors"
                      title="Copy phone"
                    >
                      {copiedPhoneId === lead.id ? (
                        <Check className="w-3 h-3 text-emerald-500" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                  </div>

                  {/* 6. Two buttons max: Call + Open */}
                  <div className="grid grid-cols-2 gap-2.5 pt-2 pl-6 sm:max-w-xs">
                    <a
                      href={`tel:${lead.phone}`}
                      className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-[#F95721] hover:bg-[#E04612] text-white text-xs font-bold transition-all shadow-sm active:scale-95"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>Call</span>
                    </a>

                    <Link
                      href={`/studio/queue?tab=callbacks&lead_id=${lead.id}`}
                      className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 border border-[#ECE8E1] dark:border-white/10 text-[#111110] dark:text-[#F5F3EF] text-xs font-semibold transition-all active:scale-95"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-[#8A8680]" />
                      <span>Open</span>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. CALLER PERFORMANCE MATRIX (Scatter Plot: Volume vs Interest Rate)       */}
      {/* ========================================================================= */}
      {activeTab === "callers" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="p-4 sm:p-5 rounded-2xl sm:rounded-3xl bg-white dark:bg-[#131414] border border-[#ECE8E1] dark:border-white/10 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#ECE8E1]/80 dark:border-white/10 gap-3">
          <div>
            <span className="text-[10px] font-mono tracking-widest uppercase text-[#8A8680] font-bold block">
              CALLER PERFORMANCE
            </span>
            <p className="text-xs font-mono text-[#6E6B66] dark:text-[#8A8680] mt-0.5">
              Showing: {timeRangeLabel} ({scatterMetrics.activeCount} active caller{scatterMetrics.activeCount === 1 ? "" : "s"} plotted)
            </p>
          </div>

          {/* Time range selector: All Time vs 30 Days vs 7 Days vs Today */}
          <div className="flex items-center p-1 bg-black/5 dark:bg-white/5 rounded-2xl border border-[#ECE8E1] dark:border-white/10 shrink-0 self-start sm:self-auto">
            {(["all", "30d", "7d", "today"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setTimeRange(r)}
                className={`px-2.5 sm:px-3 py-1 rounded-xl text-xs font-semibold transition-all ${
                  timeRange === r
                    ? "bg-white dark:bg-[#1C1A17] text-[#111110] dark:text-[#F5F3EF] shadow-sm"
                    : "text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF]"
                }`}
              >
                {r === "all" ? "All Time" : r === "30d" ? "30 Days" : r === "7d" ? "7 Days" : "Today"}
              </button>
            ))}
          </div>
        </div>

        {/* Scalable Vector Graphics Scatter Plot */}
        <div className="relative w-full bg-black/[0.02] dark:bg-black/30 rounded-2xl border border-[#ECE8E1]/80 dark:border-white/10 p-2 sm:p-4 overflow-hidden">
          <svg
            viewBox="0 0 540 280"
            className="w-full h-auto min-w-[340px] select-none block"
            style={{ maxHeight: "360px" }}
          >
            <defs>
              {/* Drop shadow filter for active caller dots */}
              <filter id="dot-shadow" x="-30%" y="-30%" width="160%" height="160%">
                <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" floodOpacity="0.25" />
              </filter>
            </defs>

            {/* Quadrant Watermark Corner Labels */}
            {/* Top-Left: UNICORNS (Low Vol, High Rate) */}
            <text x="75" y="42" className="fill-purple-600 dark:fill-purple-400 font-mono text-[10px] font-bold">
              UNICORNS
            </text>
            <text x="75" y="53" className="fill-[#8A8680]/70 dark:fill-[#8A8680] font-mono text-[8px]">
              Low Vol · High Rate
            </text>

            {/* Top-Right: STARS (High Vol, High Rate) */}
            <text x="495" y="42" textAnchor="end" className="fill-emerald-600 dark:fill-emerald-400 font-mono text-[10px] font-bold">
              STARS ★
            </text>
            <text x="495" y="53" textAnchor="end" className="fill-[#8A8680]/70 dark:fill-[#8A8680] font-mono text-[8px]">
              High Vol · High Rate
            </text>

            {/* Bottom-Left: NEEDS HELP (Low Vol, Low Rate) */}
            <text x="75" y="202" className="fill-[#8A8680] font-mono text-[10px] font-bold">
              NEEDS HELP
            </text>
            <text x="75" y="213" className="fill-[#8A8680]/70 dark:fill-[#8A8680] font-mono text-[8px]">
              Low Vol · Low Rate
            </text>

            {/* Bottom-Right: GRINDERS (High Vol, Low Rate) */}
            <text x="495" y="202" textAnchor="end" className="fill-amber-600 dark:fill-amber-400 font-mono text-[10px] font-bold">
              GRINDERS
            </text>
            <text x="495" y="213" textAnchor="end" className="fill-[#8A8680]/70 dark:fill-[#8A8680] font-mono text-[8px]">
              High Vol · Low Rate
            </text>

            {/* Quadrant Divider Crosshairs (subtle dashed lines at midpoints) */}
            <line
              x1="285"
              y1="25"
              x2="285"
              y2="225"
              stroke="currentColor"
              strokeDasharray="3 3"
              strokeWidth="1"
              className="text-[#8A8680]/20 dark:text-white/10"
            />
            <line
              x1="65"
              y1="125"
              x2="505"
              y2="125"
              stroke="currentColor"
              strokeDasharray="3 3"
              strokeWidth="1"
              className="text-[#8A8680]/20 dark:text-white/10"
            />

            {/* Y-Axis Gridlines & Ticks */}
            {scatterMetrics.yTicks.map((tickVal) => {
              const yPos = 225 - (tickVal / scatterMetrics.maxY) * 200;
              return (
                <g key={`y-tick-${tickVal}`}>
                  {/* Subtle horizontal gridline */}
                  <line
                    x1="65"
                    y1={yPos}
                    x2="505"
                    y2={yPos}
                    stroke="currentColor"
                    strokeDasharray="2 3"
                    strokeWidth="1"
                    className="text-[#ECE8E1] dark:text-white/10"
                  />
                  {/* Tick line on axis */}
                  <line
                    x1="60"
                    y1={yPos}
                    x2="65"
                    y2={yPos}
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="text-[#8A8680]"
                  />
                  {/* Tick label */}
                  <text
                    x="56"
                    y={yPos + 3.5}
                    textAnchor="end"
                    className="fill-[#8A8680] font-mono text-[9px] font-medium"
                  >
                    {tickVal}%
                  </text>
                </g>
              );
            })}

            {/* X-Axis Gridlines & Ticks */}
            {scatterMetrics.xTicks.map((tickVal) => {
              const xPos = 65 + (tickVal / scatterMetrics.maxX) * 440;
              return (
                <g key={`x-tick-${tickVal}`}>
                  {/* Subtle vertical gridline */}
                  <line
                    x1={xPos}
                    y1="25"
                    x2={xPos}
                    y2="225"
                    stroke="currentColor"
                    strokeDasharray="2 3"
                    strokeWidth="1"
                    className="text-[#ECE8E1] dark:text-white/10"
                  />
                  {/* Tick line on axis */}
                  <line
                    x1={xPos}
                    y1="225"
                    x2={xPos}
                    y2="230"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="text-[#8A8680]"
                  />
                  {/* Tick label */}
                  <text
                    x={xPos}
                    y="244"
                    textAnchor="middle"
                    className="fill-[#8A8680] font-mono text-[9px] font-medium"
                  >
                    {tickVal}
                  </text>
                </g>
              );
            })}

            {/* Solid Y-Axis Line & Arrow */}
            <line
              x1="65"
              y1="25"
              x2="65"
              y2="225"
              stroke="currentColor"
              strokeWidth="2"
              className="text-[#111110]/30 dark:text-white/30"
            />
            <polygon points="65,18 61,26 69,26" fill="currentColor" className="text-[#8A8680]" />

            {/* Rotated Y-Axis Label along left edge */}
            <text
              transform="rotate(-90 20 125)"
              x="20"
              y="125"
              textAnchor="middle"
              className="fill-[#8A8680] font-mono text-[9px] font-bold uppercase tracking-wider"
            >
              CONTACT → INTERESTED RATE (%)
            </text>

            {/* Solid X-Axis Line & Arrow */}
            <line
              x1="65"
              y1="225"
              x2="505"
              y2="225"
              stroke="currentColor"
              strokeWidth="2"
              className="text-[#111110]/30 dark:text-white/30"
            />
            <polygon points="513,225 505,221 505,229" fill="currentColor" className="text-[#8A8680]" />

            {/* Horizontal X-Axis Label below plot */}
            <text
              x="285"
              y="266"
              textAnchor="middle"
              className="fill-[#8A8680] font-mono text-[9.5px] font-bold uppercase tracking-wider"
            >
              DIALS VOLUME ►
            </text>

            {/* Plotted Caller Dots */}
            {scatterMetrics.callers.length === 0 ? (
              <text
                x="285"
                y="130"
                textAnchor="middle"
                className="fill-[#8A8680] font-mono text-xs font-medium"
              >
                No active dials logged in this time range
              </text>
            ) : (
              scatterMetrics.callers.map((caller) => {
                const rawCx = 65 + (caller.total_dials / scatterMetrics.maxX) * 440;
                const rawCy = 225 - (caller.close_rate / scatterMetrics.maxY) * 200;
                // Safe padding inside boundaries
                const cx = Math.max(85, Math.min(485, rawCx));
                const cy = Math.max(45, Math.min(210, rawCy));

                const isSelected = selectedCaller?.id === caller.id;
                const isHovered = hoveredCallerId === caller.id;
                const roleConfig = getRoleDotColor(caller.role);
                const initials = getInitials(caller.name);
                const shortName = getShortName(caller.name);

                // Right edge protection: if in right half, flip name to LEFT of dot
                const isRightHalf = cx > 280;
                const labelX = isRightHalf ? cx - 16 : cx + 16;
                const labelAnchor = isRightHalf ? "end" : "start";

                // Tooltip bubble positioning
                const tooltipX = Math.max(85, Math.min(455, cx));
                const tooltipY = Math.max(24, cy - 20);

                return (
                  <g
                    key={caller.id}
                    onClick={() => setSelectedCaller(isSelected ? null : caller)}
                    onMouseEnter={() => setHoveredCallerId(caller.id)}
                    onMouseLeave={() => setHoveredCallerId(null)}
                    className="cursor-pointer group"
                  >
                    {/* Pulsing halo ring on hover or select */}
                    {(isSelected || isHovered) && (
                      <circle
                        cx={cx}
                        cy={cy}
                        r="18"
                        fill={roleConfig.bg}
                        opacity="0.2"
                        className="transition-all animate-pulse"
                      />
                    )}

                    {/* Dot Circle (22px diameter, 2px white border for high contrast) */}
                    <circle
                      cx={cx}
                      cy={cy}
                      r="11"
                      fill={roleConfig.bg}
                      stroke="white"
                      strokeWidth="2"
                      filter="url(#dot-shadow)"
                      className="dark:stroke-[#131414] transition-transform duration-150 group-hover:scale-110"
                    />

                    {/* Initials Inside Dot */}
                    <text
                      x={cx}
                      y={cy + 3.5}
                      textAnchor="middle"
                      fill="white"
                      className="font-mono text-[8.5px] font-bold pointer-events-none select-none"
                    >
                      {initials}
                    </text>

                    {/* Name Label beside Dot (Flipped to left if near right edge) */}
                    <text
                      x={labelX}
                      y={cy + 3.5}
                      textAnchor={labelAnchor}
                      className="fill-[#111110] dark:fill-[#F5F3EF] font-mono text-[10px] font-bold pointer-events-none select-none transition-colors group-hover:fill-[#F95721]"
                    >
                      {shortName}
                    </text>

                    {/* Interactive Tooltip Callout Bubble on Hover or Tap */}
                    {(isSelected || isHovered) && (
                      <g className="transition-all pointer-events-none">
                        <rect
                          x={tooltipX - 75}
                          y={tooltipY - 14}
                          width="150"
                          height="22"
                          rx="6"
                          className="fill-[#111110] dark:fill-[#F5F3EF] shadow-xl"
                        />
                        <polygon
                          points={`${tooltipX - 4},${tooltipY + 8} ${tooltipX + 4},${tooltipY + 8} ${tooltipX},${tooltipY + 12}`}
                          className="fill-[#111110] dark:fill-[#F5F3EF]"
                        />
                        <text
                          x={tooltipX}
                          y={tooltipY + 1}
                          textAnchor="middle"
                          className="fill-white dark:fill-[#111110] font-mono text-[9px] font-bold"
                        >
                          {shortName} · {caller.total_dials} dials · {caller.close_rate}% rate
                        </text>
                      </g>
                    )}
                  </g>
                );
              })
            )}
          </svg>

          {/* Active Caller Inspection Card */}
          {selectedCaller && (
            <div className="mt-3 p-3.5 rounded-2xl bg-white dark:bg-[#181715] border border-[#F95721]/30 shadow-md flex items-center justify-between gap-3 animate-in fade-in duration-150">
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs text-white shrink-0 shadow-sm"
                  style={{ backgroundColor: getRoleDotColor(selectedCaller.role).bg }}
                >
                  {getInitials(selectedCaller.name)}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold text-[#111110] dark:text-[#F5F3EF] truncate">
                      {selectedCaller.name}
                    </h4>
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-semibold bg-black/5 dark:bg-white/10 text-[#6E6B66] dark:text-[#8A8680]">
                      {getRoleDotColor(selectedCaller.role).label}
                    </span>
                  </div>
                  <p className="text-[10px] text-[#8A8680] font-mono mt-0.5">
                    {selectedCaller.total_dials} dials &bull; {selectedCaller.connects} connects ({selectedCaller.connect_rate}%) &bull; {selectedCaller.interested} warm leads &bull; {selectedCaller.close_rate}% contact-to-interest
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCaller(null)}
                className="text-xs text-[#8A8680] hover:text-[#111110] dark:hover:text-white px-2.5 py-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors font-medium"
              >
                Close
              </button>
            </div>
          )}

          {/* Role Color Legend & Count */}
          <div className="flex flex-wrap items-center justify-between pt-3 px-1 text-xs text-[#8A8680] border-t border-[#ECE8E1]/80 dark:border-white/10 gap-2 mt-2">
            <div className="flex items-center gap-3.5 flex-wrap">
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#6E6B66] dark:text-[#8A8680]">
                Legend:
              </span>
              <div className="flex items-center gap-1.5 font-mono text-[11px]">
                <span className="w-2.5 h-2.5 rounded-full bg-[#F95721] inline-block shadow-sm" />
                <span className="text-[#111110] dark:text-[#F5F3EF]">Caller</span>
              </div>
              <div className="flex items-center gap-1.5 font-mono text-[11px]">
                <span className="w-2.5 h-2.5 rounded-full bg-[#8B5CF6] inline-block shadow-sm" />
                <span className="text-[#111110] dark:text-[#F5F3EF]">Manager / Admin</span>
              </div>
              <div className="flex items-center gap-1.5 font-mono text-[11px]">
                <span className="w-2.5 h-2.5 rounded-full bg-[#0284C7] inline-block shadow-sm" />
                <span className="text-[#111110] dark:text-[#F5F3EF]">Developer</span>
              </div>
            </div>

            <div className="font-mono text-[10px] text-[#8A8680]">
              Showing: {timeRangeLabel} ({scatterMetrics.activeCount} active callers)
            </div>
          </div>
        </div>

        {/* Compact Caller Ranking Rows below chart (Top 3 default + Unfold All) */}
        {(() => {
          const callersList = data?.caller_performance || [];
          const displayedCallers = showAllCallers ? callersList : callersList.slice(0, 3);

          return (
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between text-[10px] font-mono uppercase text-[#8A8680] px-1 font-bold">
                <span>
                  {showAllCallers
                    ? `Caller Breakdown (${callersList.length})`
                    : `Top 3 Callers (${scatterMetrics.activeCount} Active · ${callersList.length} Total)`}
                </span>
                <span>Volume · Connects · Interest Rate</span>
              </div>

              <div className="divide-y divide-[#ECE8E1]/80 dark:divide-white/10 border border-[#ECE8E1]/80 dark:border-white/10 rounded-2xl overflow-hidden bg-white dark:bg-[#131414]">
                {displayedCallers.map((caller, idx) => {
                  const isMaaz = caller.name.toLowerCase().includes("maaz");
                  const roleConfig = getRoleDotColor(caller.role);

                  return (
                    <div
                      key={caller.id}
                      onClick={() => setSelectedCaller(caller)}
                      className={`p-3 flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                        selectedCaller?.id === caller.id
                          ? "bg-[#F95721]/[0.08] dark:bg-[#F95721]/[0.12]"
                          : isMaaz
                          ? "bg-amber-500/[0.04] dark:bg-amber-500/[0.05]"
                          : "hover:bg-black/[0.01] dark:hover:bg-white/[0.01]"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-xs font-mono font-bold text-[#8A8680] w-4 text-center">
                          #{idx + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-[#111110] dark:text-[#F5F3EF] truncate">
                              {caller.name}
                            </span>
                            {isMaaz && (
                              <span title="Volume Leader (100+ Dials)" className="text-xs inline-block ml-0.5">
                                👑
                              </span>
                            )}
                            <span
                              className="w-1.5 h-1.5 rounded-full shrink-0"
                              style={{ backgroundColor: roleConfig.bg }}
                              title={roleConfig.label}
                            />
                          </div>
                          <span className="text-[10px] text-[#8A8680] font-mono">
                            {caller.total_dials} total dials &bull; {caller.connects} connects ({caller.connect_rate}%)
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right">
                          <span className="text-xs font-bold text-[#111110] dark:text-[#F5F3EF] block font-mono">
                            {caller.close_rate}%
                          </span>
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono block">
                            {caller.interested} warm leads
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Bottom Unfold / Collapse Button */}
                {callersList.length > 3 && (
                  <button
                    type="button"
                    onClick={() => setShowAllCallers(!showAllCallers)}
                    className="w-full py-2.5 px-3 text-center text-xs font-semibold text-[#F95721] hover:underline bg-black/[0.01] dark:bg-white/[0.01] hover:bg-black/5 dark:hover:bg-white/5 transition-colors border-t border-[#ECE8E1]/80 dark:border-white/10 flex items-center justify-center gap-1.5"
                  >
                    <span>
                      {showAllCallers
                        ? "Show Top 3 Only ▴"
                        : `View All ${callersList.length} Callers ▾`}
                    </span>
                  </button>
                )}
              </div>
            </div>
          );
        })()}
      </div>
      </div>
      )}

      {/* ========================================================================= */}
      {/* 5 & 6. PIPELINE & TRENDS (Conversion Pipeline, Momentum, Niche Yield)     */}
      {/* ========================================================================= */}
      {activeTab === "pipeline" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Decision 3 & 6: Scraper Engine Trigger & Real-time Daemon Status Pill */}
          <ScraperTriggerCard
            totalLeads={data?.funnel?.total_leads ?? 0}
            onLeadsUpdated={() => fetchInsights(timeRange)}
          />

          {/* Card 5A: Conversion Pipeline (Horizontal Milestone Stepper) */}
          {(() => {
          const totalLeads = data?.funnel?.total_leads ?? 0;
          const dialedLeads = data?.funnel?.dialed ?? 0;
          const connectedLeads = data?.funnel?.connected ?? 0;
          const warmLeads = data?.funnel?.interested ?? 0;
          const wonLeads = data?.funnel?.closed_won ?? 0;

          const totalDials = data?.funnel?.total_dials ?? 0;
          const noAnswer = data?.funnel?.no_answer ?? 0;
          const callbacks = data?.funnel?.callbacks ?? 0;

          const dialedPct = totalLeads > 0 ? Math.round((dialedLeads / totalLeads) * 100) : 0;
          const connectPct = dialedLeads > 0 ? Math.round((connectedLeads / dialedLeads) * 100) : 0;

          return (
            <div className="p-4 sm:p-5 rounded-2xl sm:rounded-3xl bg-white dark:bg-[#131414] border border-[#ECE8E1] dark:border-white/10 shadow-sm space-y-4 flex flex-col justify-between">
              <div>
                {/* Header */}
                <div className="pb-3 border-b border-[#ECE8E1]/80 dark:border-white/10 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layers className="w-3.5 h-3.5 text-[#F95721]" />
                    <span className="text-[10px] font-mono tracking-widest uppercase text-[#8A8680] font-bold">
                      CONVERSION PIPELINE
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                    {dialedPct}% Pool Contacted
                  </span>
                </div>

                {/* Horizontal Pipeline Steps */}
                <div className="pt-3 pb-1">
                  <div className="grid grid-cols-5 gap-1.5 sm:gap-2 text-center">
                    {/* 1. Pool */}
                    <div className="p-2 sm:p-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.02] border border-[#ECE8E1]/60 dark:border-white/5 flex flex-col justify-between">
                      <span className="text-[9px] sm:text-[10px] font-mono uppercase font-bold text-[#8A8680]">
                        Pool
                      </span>
                      <div className="text-xl sm:text-2xl font-black text-[#111110] dark:text-[#F5F3EF] font-mono my-1">
                        {totalLeads}
                      </div>
                      <span className="text-[9px] font-mono text-[#8A8680] truncate">
                        100% list
                      </span>
                    </div>

                    {/* 2. Dialed */}
                    <div className="p-2 sm:p-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.02] border border-[#ECE8E1]/60 dark:border-white/5 flex flex-col justify-between">
                      <span className="text-[9px] sm:text-[10px] font-mono uppercase font-bold text-[#8A8680]">
                        Dialed
                      </span>
                      <div className="text-xl sm:text-2xl font-black text-[#111110] dark:text-[#F5F3EF] font-mono my-1">
                        {dialedLeads}
                      </div>
                      <span className="text-[9px] font-mono text-[#8A8680] truncate">
                        {dialedPct}% reached
                      </span>
                    </div>

                    {/* 3. Spoken */}
                    <div className="p-2 sm:p-2.5 rounded-2xl bg-blue-500/[0.03] dark:bg-blue-500/[0.05] border border-blue-500/20 flex flex-col justify-between">
                      <span className="text-[9px] sm:text-[10px] font-mono uppercase font-bold text-blue-600 dark:text-blue-400">
                        Spoken
                      </span>
                      <div className="text-xl sm:text-2xl font-black text-blue-600 dark:text-blue-400 font-mono my-1">
                        {connectedLeads}
                      </div>
                      <span className="text-[9px] font-mono text-blue-600/80 dark:text-blue-400/80 truncate">
                        {connectPct}% pickup
                      </span>
                    </div>

                    {/* 4. Warm Opportunity */}
                    <div className="p-2 sm:p-2.5 rounded-2xl bg-[#F95721]/[0.05] dark:bg-[#F95721]/[0.08] border border-[#F95721]/30 flex flex-col justify-between shadow-sm">
                      <span className="text-[9px] sm:text-[10px] font-mono uppercase font-bold text-[#F95721] flex items-center justify-center gap-0.5">
                        <span>Warm</span>
                        <span>🔥</span>
                      </span>
                      <div className="text-xl sm:text-2xl font-black text-[#F95721] font-mono my-1">
                        {warmLeads}
                      </div>
                      <span className="text-[9px] font-mono text-[#F95721] font-bold truncate">
                        Ready to close
                      </span>
                    </div>

                    {/* 5. Won */}
                    <div className="p-2 sm:p-2.5 rounded-2xl bg-emerald-500/[0.03] dark:bg-emerald-500/[0.05] border border-emerald-500/20 flex flex-col justify-between">
                      <span className="text-[9px] sm:text-[10px] font-mono uppercase font-bold text-emerald-600 dark:text-emerald-400 flex items-center justify-center gap-0.5">
                        <span>Won</span>
                        <span>🏆</span>
                      </span>
                      <div className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono my-1">
                        {wonLeads}
                      </div>
                      <span className="text-[9px] font-mono text-emerald-600/80 dark:text-emerald-400/80 truncate">
                        Paid deals
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Call Activity Breakdown */}
              <div className="pt-3 border-t border-[#ECE8E1]/80 dark:border-white/10 space-y-2">
                <div className="flex items-center justify-between text-[10px] font-mono uppercase text-[#8A8680]">
                  <span>Outbound Activity ({totalDials} Dials Total)</span>
                  <span>Results</span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                  {/* Conversations */}
                  <div className="p-2 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-[#ECE8E1]/70 dark:border-white/10 flex items-center gap-2">
                    <span className="text-base shrink-0">📞</span>
                    <div className="min-w-0">
                      <div className="font-bold text-[#111110] dark:text-[#F5F3EF]">
                        {connectedLeads}
                      </div>
                      <div className="text-[9px] text-[#8A8680] truncate">
                        Conversations
                      </div>
                    </div>
                  </div>

                  {/* Callbacks Queued */}
                  <div className="p-2 rounded-xl bg-amber-500/[0.05] border border-amber-500/25 flex items-center gap-2">
                    <span className="text-base shrink-0">⏳</span>
                    <div className="min-w-0">
                      <div className="font-bold text-amber-600 dark:text-amber-400">
                        {callbacks}
                      </div>
                      <div className="text-[9px] text-amber-700/80 dark:text-amber-300/80 truncate">
                        Callbacks Queued
                      </div>
                    </div>
                  </div>

                  {/* No Answer */}
                  <div className="p-2 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-[#ECE8E1]/70 dark:border-white/10 flex items-center gap-2">
                    <span className="text-base shrink-0">📵</span>
                    <div className="min-w-0">
                      <div className="font-bold text-[#111110] dark:text-[#F5F3EF]">
                        {noAnswer}
                      </div>
                      <div className="text-[9px] text-[#8A8680] truncate">
                        No Answer
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Card 5B: Weekly Momentum Trend (Last 4 Weeks) */}
        <div className="p-4 sm:p-5 rounded-2xl sm:rounded-3xl bg-white dark:bg-[#131414] border border-[#ECE8E1] dark:border-white/10 shadow-sm space-y-3.5 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="pb-2 border-b border-[#ECE8E1]/80 dark:border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-3.5 h-3.5 text-[#F95721]" />
                <span className="text-[10px] font-mono tracking-widest uppercase text-[#8A8680] font-bold">
                  WEEKLY MOMENTUM
                </span>
              </div>
              <span className="text-[10px] font-mono text-[#8A8680]">
                {data?.weekly_trend?.reduce((acc, w) => acc + w.dials, 0) ?? 0} Dials &bull; 4-Week Window
              </span>
            </div>

            {/* Seamless Minimalist Column Chart */}
            <div className="pt-2">
              {data?.weekly_trend && data.weekly_trend.length > 0 ? (
                <div className="space-y-2">
                  {/* The Columns Lane */}
                  <div className="grid grid-cols-4 gap-2 sm:gap-4 items-end h-28 pb-1 border-b border-[#ECE8E1] dark:border-white/10">
                    {data.weekly_trend.map((w, i) => {
                      const isLatest = i === data.weekly_trend!.length - 1;
                      const maxWeekDials = Math.max(...data.weekly_trend!.map((x) => x.dials), 10);
                      const barHeightPercent = w.dials === 0 ? 3 : Math.max(8, Math.min(100, (w.dials / maxWeekDials) * 100));

                      return (
                        <div key={w.label} className="flex flex-col items-center justify-end h-full group">
                          {/* Dials value on top of bar */}
                          <span className={`text-xs font-mono font-bold mb-1 transition-colors ${
                            isLatest ? "text-[#F95721]" : "text-[#111110] dark:text-[#F5F3EF]"
                          }`}>
                            {w.dials}
                          </span>

                          {/* Architectural slim column (2px rounded cap, NOT cartoon sausage dome) */}
                          <div
                            className={`w-8 sm:w-12 rounded-t-[3px] transition-all duration-300 ${
                              isLatest
                                ? "bg-[#F95721] shadow-sm"
                                : w.dials > 50
                                ? "bg-zinc-700 dark:bg-zinc-300 group-hover:bg-zinc-800"
                                : "bg-zinc-200 dark:bg-zinc-800 group-hover:bg-zinc-300"
                            }`}
                            style={{ height: `${barHeightPercent}%` }}
                          />
                        </div>
                      );
                    })}
                  </div>

                  {/* Clean labels & metrics row below the baseline */}
                  <div className="grid grid-cols-4 gap-2 sm:gap-4 text-center pt-1">
                    {data.weekly_trend.map((w, i) => {
                      const isLatest = i === data.weekly_trend!.length - 1;
                      const shortDate = formatShortDate(w.date_range);

                      return (
                        <div key={`label-${w.label}`} className="space-y-0.5">
                          <span className={`text-[10px] font-mono font-bold block ${
                            isLatest ? "text-[#F95721]" : "text-[#111110] dark:text-[#F5F3EF]"
                          }`}>
                            {w.label}
                          </span>
                          <span className="text-[9px] font-mono text-[#8A8680] block whitespace-nowrap">
                            {shortDate}
                          </span>
                          <span className="text-[10px] font-mono font-semibold text-emerald-600 dark:text-emerald-400 block pt-0.5">
                            {w.interested > 0 ? `+${w.interested} warm` : "0 warm"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-[#8A8680]">
                  No weekly trend recorded yet
                </div>
              )}
            </div>
          </div>

          <p className="text-[10px] text-[#8A8680] font-mono pt-2 border-t border-[#ECE8E1]/60 dark:border-white/5 text-center">
            Pacing: {data?.snapshot?.fleet_dials_in_range ?? 0} total fleet calls logged in selected period
          </p>
        </div>

      {/* ========================================================================= */}
      {/* 6. NICHE PERFORMANCE (Single-Line Highlight when 1 Niche, or Table)       */}
      {/* ========================================================================= */}
      <div className="p-4 sm:p-5 rounded-2xl sm:rounded-3xl bg-white dark:bg-[#131414] border border-[#ECE8E1] dark:border-white/10 shadow-sm space-y-3">
        <div className="pb-2 border-b border-[#ECE8E1]/80 dark:border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="w-3.5 h-3.5 text-[#F95721]" />
            <span className="text-[10px] font-mono tracking-widest uppercase text-[#8A8680] font-bold">
              NICHE PERFORMANCE & QUALITY
            </span>
          </div>
          <span className="text-[10px] font-mono text-[#8A8680]">Target Vertical Yield</span>
        </div>

        {/* If only 1 niche exists, render as an executive single-line highlight banner */}
        {!data?.niche_breakdown || data.niche_breakdown.length <= 1 ? (
          <div className="p-3.5 sm:p-4 rounded-2xl bg-black/[0.02] dark:bg-white/[0.02] border border-[#ECE8E1]/80 dark:border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-[#F95721]/10 text-[#F95721] flex items-center justify-center font-bold text-xs shrink-0">
                🎯
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[#111110] dark:text-[#F5F3EF]">
                    Active Focus: {data?.niche_breakdown?.[0]?.niche || "Dentist"}
                  </span>
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-[#F95721]/15 text-[#F95721] border border-[#F95721]/30">
                    Primary Vertical
                  </span>
                </div>
                <p className="text-[11px] text-[#8A8680] font-mono mt-0.5">
                  {data?.niche_breakdown?.[0]?.total_leads ?? 0} leads in pool &bull; {data?.niche_breakdown?.[0]?.dials ?? 0} dials logged &bull; {data?.niche_breakdown?.[0]?.interested ?? 0} warm prospects
                </p>
              </div>
            </div>

            <div className="text-left sm:text-right self-start sm:self-auto">
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 font-mono block">
                {data?.niche_breakdown?.[0]?.close_rate ?? 0}% Contact-to-Interest Rate
              </span>
              <span className="text-[10px] text-[#8A8680] font-mono block">
                Single campaign currently active
              </span>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-[#ECE8E1]/80 dark:divide-white/10 pt-1">
            {data.niche_breakdown.map((n) => (
              <div key={n.niche} className="py-2.5 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-[#111110] dark:text-[#F5F3EF]">
                    {n.niche}
                  </h4>
                  <p className="text-[10px] text-[#8A8680] font-mono">
                    {n.total_leads} leads &bull; {n.dials} dials
                  </p>
                </div>

                <div className="text-right">
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 block font-mono">
                    {n.interested} Interested
                  </span>
                  <span className="text-[10px] text-[#8A8680] font-mono block">
                    {n.close_rate}% rate
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      </div>
      )}
    </div>
  );
}
