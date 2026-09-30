"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Users,
  PhoneCall,
  Flame,
  Clock,
  ExternalLink,
  KeyRound,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  X,
  ShieldAlert,
  Inbox,
  UserCheck,
  Radio,
  Zap,
} from "lucide-react";

interface CallerStat {
  id: string;
  full_name: string;
  email: string;
  role: string;
  active: boolean;
  is_available: boolean;
  is_online: boolean;
  require_password_change: boolean;
  temp_password_issued_at: string | null;
  dials_today: number;
  connects_today: number;
  connect_rate_percent: number;
  interested_today: number;
  callbacks_today: number;
  talk_time_seconds: number;
  active_leads_count: number;
}

interface TeamSummary {
  total_dials_today: number;
  total_connects_today: number;
  total_pipeline_escalations: number;
  active_callers: number;
  total_callers: number;
}

function formatDuration(totalSeconds: number): string {
  if (!totalSeconds || totalSeconds <= 0) return "0s";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function generateTemporaryPassword(): string {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let randomPart = "";
  for (let i = 0; i < 6; i++) {
    randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `Pinsite-${randomPart}!`;
}

export default function ManagerTeamPage() {
  const router = useRouter();
  const [callers, setCallers] = useState<CallerStat[]>([]);
  const [summary, setSummary] = useState<TeamSummary>({
    total_dials_today: 0,
    total_connects_today: 0,
    total_pipeline_escalations: 0,
    active_callers: 0,
    total_callers: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "online" | "offline">("all");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());
  const [countdown, setCountdown] = useState(30);

  // Password reset modal state
  const [targetCaller, setTargetCaller] = useState<CallerStat | null>(null);
  const [tempPassword, setTempPassword] = useState("");
  const [isResetting, setIsResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSuccess, setResetSuccess] = useState<string | null>(null);
  const [copiedPassword, setCopiedPassword] = useState(false);

  const fetchTeamStats = useCallback(async (isManual: boolean = false) => {
    if (isManual) {
      setRefreshing(true);
    }
    try {
      const res = await fetch("/api/manager/team-stats");
      if (res.ok) {
        const data = await res.json();
        setCallers(data.callers || []);
        if (data.summary) {
          setSummary(data.summary);
        }
        setLastRefreshedAt(new Date());
        setCountdown(30);
      } else {
        console.warn("Failed to load team stats:", res.status);
      }
    } catch (err) {
      console.warn("Team stats network error:", err);
    } finally {
      setLoading(false);
      if (isManual) {
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchTeamStats();
  }, [fetchTeamStats]);

  // 30-second Auto-refresh countdown effect
  useEffect(() => {
    if (!autoRefresh) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          fetchTeamStats();
          return 30;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [autoRefresh, fetchTeamStats]);

  // Filtered callers list
  const filteredCallers = useMemo(() => {
    return callers.filter((c) => {
      const matchesSearch =
        c.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.email.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      if (statusFilter === "online") {
        return c.is_online;
      }
      if (statusFilter === "offline") {
        return !c.is_online;
      }
      return true;
    });
  }, [callers, searchQuery, statusFilter]);

  function handleOpenResetModal(caller: CallerStat) {
    setTargetCaller(caller);
    setTempPassword(generateTemporaryPassword());
    setResetError(null);
    setResetSuccess(null);
    setCopiedPassword(false);
  }

  function handleCloseResetModal() {
    setTargetCaller(null);
    setTempPassword("");
    setResetError(null);
    setResetSuccess(null);
    setCopiedPassword(false);
  }

  async function handleExecutePasswordReset(e: React.FormEvent) {
    e.preventDefault();
    if (!targetCaller || !tempPassword.trim()) return;

    if (tempPassword.length < 8) {
      setResetError("Password must be at least 8 characters");
      return;
    }

    setIsResetting(true);
    setResetError(null);
    setResetSuccess(null);

    try {
      const res = await fetch("/api/manager/team/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: targetCaller.id,
          tempPassword: tempPassword.trim(),
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "Failed to update temporary password");
      }

      setResetSuccess(
        `Temporary password for ${targetCaller.full_name} set successfully. The caller will be prompted to choose a new password upon their next login.`
      );

      // Optimistically update caller state
      setCallers((prev) =>
        prev.map((c) =>
          c.id === targetCaller.id
            ? { ...c, require_password_change: true, temp_password_issued_at: new Date().toISOString() }
            : c
        )
      );
    } catch (err: any) {
      setResetError(err.message || "An unexpected error occurred during password reset");
    } finally {
      setIsResetting(false);
    }
  }

  function copyPasswordToClipboard() {
    if (!tempPassword) return;
    navigator.clipboard.writeText(tempPassword);
    setCopiedPassword(true);
    setTimeout(() => setCopiedPassword(false), 2000);
  }

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-12">
      {/* Header & Sub-Navigation */}
      <div className="pb-4 border-b border-[#ECE8E1] dark:border-[#2D2924] pt-2 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <span className="text-[11px] font-mono tracking-widest uppercase text-[#F95721] font-semibold">
            TEAM COMMAND CENTER
          </span>
          <h1 className="text-3xl sm:text-4xl font-black text-[#111110] dark:text-[#F5F3EF] tracking-tight mt-1">
            Caller roster & telemetry.
          </h1>
          <p className="text-xs text-[#6E6B66] dark:text-[#8A8680] mt-1.5">
            Monitor daily call output, talk time, queue depth, mirror live caller decks, and manage credentials.
          </p>
        </div>

        {/* Manager Navigation Pills */}
        <div className="flex items-center gap-1.5 p-1 bg-black/5 dark:bg-white/5 rounded-2xl border border-[#ECE8E1] dark:border-[#2D2924] shrink-0 self-start md:self-auto overflow-x-auto max-w-full">
          <Link
            href="/manager/team"
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#F95721] text-white shadow-sm transition-all flex items-center gap-1.5 shrink-0"
          >
            <Users className="w-3.5 h-3.5" />
            <span>Team Roster</span>
          </Link>
          <Link
            href="/manager/quarantine"
            className="px-3 py-1.5 rounded-xl text-xs font-medium text-[#6E6B66] dark:text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF] hover:bg-black/5 dark:hover:bg-white/5 transition-all flex items-center gap-1.5 shrink-0"
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Quarantine</span>
          </Link>
          <Link
            href="/manager/invites"
            className="px-3 py-1.5 rounded-xl text-xs font-medium text-[#6E6B66] dark:text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF] hover:bg-black/5 dark:hover:bg-white/5 transition-all shrink-0"
          >
            Invites
          </Link>
          <Link
            href="/manager/ingestion"
            className="px-3 py-1.5 rounded-xl text-xs font-medium text-[#6E6B66] dark:text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF] hover:bg-black/5 dark:hover:bg-white/5 transition-all shrink-0"
          >
            CSV Ingestion
          </Link>
        </div>
      </div>

      {/* Top Controls: Auto Refresh & Manual Trigger */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white dark:bg-[#1C1A17] p-3 px-4 rounded-2xl border border-[#ECE8E1] dark:border-[#2D2924] shadow-sm text-xs">
        <div className="flex items-center gap-2 text-[#6E6B66] dark:text-[#8A8680]">
          <span className="inline-flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
            <span>Live telemetry</span>
          </span>
          <span>•</span>
          <span>Updated {lastRefreshedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setAutoRefresh((prev) => !prev)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors border ${
              autoRefresh
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                : "bg-black/5 dark:bg-white/5 text-[#8A8680] border-transparent"
            }`}
          >
            {autoRefresh ? `Auto-refresh: ${countdown}s` : "Auto-refresh: Paused"}
          </button>

          <button
            type="button"
            onClick={() => fetchTeamStats(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 rounded-lg text-xs font-medium text-[#111110] dark:text-[#F5F3EF] border border-[#ECE8E1] dark:border-[#2D2924] transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#F95721] ${refreshing ? "animate-spin" : ""}`} />
            <span>{refreshing ? "Syncing..." : "Refresh"}</span>
          </button>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Card 1: Total Dials Today */}
        <div className="p-5 rounded-3xl bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-wider text-[#6E6B66] dark:text-[#8A8680] font-semibold">
              Total Dials Today
            </span>
            <div className="w-8 h-8 rounded-2xl bg-[#F95721]/10 flex items-center justify-center text-[#F95721]">
              <PhoneCall className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-3xl font-black text-[#111110] dark:text-[#F5F3EF] tracking-tight">
              {summary.total_dials_today}
            </h3>
            <p className="text-[11px] text-[#6E6B66] dark:text-[#8A8680] mt-0.5">
              Outbound attempts across team
            </p>
          </div>
        </div>

        {/* Card 2: Total Connects */}
        <div className="p-5 rounded-3xl bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-wider text-[#6E6B66] dark:text-[#8A8680] font-semibold">
              Total Connects
            </span>
            <div className="w-8 h-8 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
              <Zap className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-baseline gap-2">
              <h3 className="text-3xl font-black text-[#111110] dark:text-[#F5F3EF] tracking-tight">
                {summary.total_connects_today}
              </h3>
              {summary.total_dials_today > 0 && (
                <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  {Math.round((summary.total_connects_today / summary.total_dials_today) * 100)}%
                </span>
              )}
            </div>
            <p className="text-[11px] text-[#6E6B66] dark:text-[#8A8680] mt-0.5">
              Live human conversations
            </p>
          </div>
        </div>

        {/* Card 3: Total Pipeline Escalations */}
        <div className="p-5 rounded-3xl bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-wider text-[#6E6B66] dark:text-[#8A8680] font-semibold">
              Hot Escalations
            </span>
            <div className="w-8 h-8 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-500">
              <Flame className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <h3 className="text-3xl font-black text-[#111110] dark:text-[#F5F3EF] tracking-tight">
              {summary.total_pipeline_escalations}
            </h3>
            <p className="text-[11px] text-[#6E6B66] dark:text-[#8A8680] mt-0.5">
              Qualified deals marked interested
            </p>
          </div>
        </div>

        {/* Card 4: Active Callers */}
        <div className="p-5 rounded-3xl bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase tracking-wider text-[#6E6B66] dark:text-[#8A8680] font-semibold">
              Active Callers
            </span>
            <div className="w-8 h-8 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-500">
              <UserCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-baseline gap-2">
              <h3 className="text-3xl font-black text-[#111110] dark:text-[#F5F3EF] tracking-tight">
                {summary.active_callers}
              </h3>
              <span className="text-xs text-[#8A8680] font-mono">
                / {summary.total_callers || callers.length} roster
              </span>
            </div>
            <p className="text-[11px] text-[#6E6B66] dark:text-[#8A8680] mt-0.5">
              Available & logged in now
            </p>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8A8680]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search callers by name or email..."
            className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] focus:border-[#F95721] rounded-2xl text-xs text-[#111110] dark:text-[#F5F3EF] outline-none shadow-sm transition-all"
          />
        </div>

        <div className="flex items-center gap-1.5 p-1 bg-white dark:bg-[#1C1A17] rounded-2xl border border-[#ECE8E1] dark:border-[#2D2924] shadow-sm self-start sm:self-auto text-xs">
          <button
            type="button"
            onClick={() => setStatusFilter("all")}
            className={`px-3 py-1.5 rounded-xl font-medium transition-all ${
              statusFilter === "all"
                ? "bg-[#111110] dark:bg-[#F5F3EF] text-white dark:text-[#111110]"
                : "text-[#6E6B66] dark:text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF]"
            }`}
          >
            All Callers ({callers.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("online")}
            className={`px-3 py-1.5 rounded-xl font-medium transition-all flex items-center gap-1.5 ${
              statusFilter === "online"
                ? "bg-emerald-600 text-white"
                : "text-[#6E6B66] dark:text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF]"
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            Online ({callers.filter((c) => c.is_online).length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("offline")}
            className={`px-3 py-1.5 rounded-xl font-medium transition-all flex items-center gap-1.5 ${
              statusFilter === "offline"
                ? "bg-stone-600 text-white"
                : "text-[#6E6B66] dark:text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF]"
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-stone-400"></span>
            Offline ({callers.filter((c) => !c.is_online).length})
          </button>
        </div>
      </div>

      {/* Callers Roster: Responsive Cards / Table */}
      {loading ? (
        <div className="p-12 text-center rounded-3xl bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924]">
          <RefreshCw className="w-6 h-6 animate-spin text-[#F95721] mx-auto mb-2" />
          <p className="text-xs text-[#8A8680]">Loading live team telemetry...</p>
        </div>
      ) : filteredCallers.length === 0 ? (
        <div className="p-12 text-center rounded-3xl bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924]">
          <Inbox className="w-8 h-8 text-[#8A8680] mx-auto mb-2" />
          <h3 className="text-sm font-bold text-[#111110] dark:text-[#F5F3EF]">No callers found</h3>
          <p className="text-xs text-[#8A8680] mt-1 max-w-sm mx-auto">
            {searchQuery
              ? `No caller matching "${searchQuery}" was found.`
              : "No outbound callers currently in your workspace. Invite new members via Team Access Control."}
          </p>
          <Link
            href="/manager/invites"
            className="inline-flex items-center gap-1.5 mt-4 px-4 py-2 bg-[#F95721] text-white rounded-xl text-xs font-semibold hover:opacity-90 transition-opacity"
          >
            Issue Seat Invite
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCallers.map((caller) => {
            const initials = caller.full_name
              .split(" ")
              .filter(Boolean)
              .map((n) => n[0])
              .join("")
              .toUpperCase()
              .slice(0, 2) || "C";

            return (
              <div
                key={caller.id}
                className="p-5 rounded-3xl bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] shadow-sm hover:border-[#F95721]/30 transition-all flex flex-col justify-between"
              >
                {/* Caller Top Identity Row */}
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative shrink-0">
                        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#F95721] to-[#FF8A65] p-0.5 shadow-sm">
                          <div className="w-full h-full rounded-[14px] bg-white dark:bg-[#1C1A17] flex items-center justify-center font-bold text-xs text-[#F95721]">
                            {initials}
                          </div>
                        </div>
                        {/* Status Dot Indicator */}
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-[#1C1A17] ${
                            caller.is_online
                              ? "bg-emerald-500 shadow-sm"
                              : "bg-stone-400"
                          }`}
                          title={caller.is_online ? "Available & Online" : "Offline / Away"}
                        />
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-[#111110] dark:text-[#F5F3EF] truncate">
                            {caller.full_name}
                          </h4>
                          {caller.require_password_change && (
                            <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-mono bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                              Temp Pass
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-[#6E6B66] dark:text-[#8A8680] truncate font-medium">
                          {caller.email}
                        </p>
                      </div>
                    </div>

                    <span
                      className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold uppercase ${
                        caller.is_online
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                          : "bg-black/5 dark:bg-white/5 text-[#8A8680] border border-transparent"
                      }`}
                    >
                      {caller.is_online ? "Active" : "Offline"}
                    </span>
                  </div>

                  {/* Daily Output Metrics Grid */}
                  <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-[#ECE8E1]/80 dark:border-[#2D2924]/80 text-center">
                    <div className="p-2 rounded-xl bg-black/[0.02] dark:bg-white/[0.02]">
                      <span className="text-[10px] font-mono uppercase text-[#8A8680] block">Dials</span>
                      <span className="text-base font-extrabold text-[#111110] dark:text-[#F5F3EF]">
                        {caller.dials_today}
                      </span>
                    </div>

                    <div className="p-2 rounded-xl bg-black/[0.02] dark:bg-white/[0.02]">
                      <span className="text-[10px] font-mono uppercase text-[#8A8680] block">Connects</span>
                      <span className="text-base font-extrabold text-emerald-600 dark:text-emerald-400">
                        {caller.connects_today}
                      </span>
                    </div>

                    <div className="p-2 rounded-xl bg-black/[0.02] dark:bg-white/[0.02]">
                      <span className="text-[10px] font-mono uppercase text-[#8A8680] block">Talk Time</span>
                      <span className="text-base font-extrabold text-[#111110] dark:text-[#F5F3EF]">
                        {formatDuration(caller.talk_time_seconds)}
                      </span>
                    </div>
                  </div>

                  {/* Queue Depth & Pipeline Sub-metrics */}
                  <div className="mt-3 flex items-center justify-between text-xs px-1 text-[#6E6B66] dark:text-[#8A8680]">
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-[#F95721]" />
                      <span>Queue Active:</span>
                      <strong className="text-[#111110] dark:text-[#F5F3EF]">{caller.active_leads_count}</strong>
                    </span>

                    <span className="flex items-center gap-1.5">
                      <Flame className="w-3.5 h-3.5 text-amber-500" />
                      <span>Interested:</span>
                      <strong className="text-amber-600 dark:text-amber-400">{caller.interested_today}</strong>
                    </span>
                  </div>
                </div>

                {/* Card Actions: Mirror View & Reset Password */}
                <div className="grid grid-cols-2 gap-2 mt-5 pt-3 border-t border-[#ECE8E1] dark:border-[#2D2924]">
                  <Link
                    href={`/queue?impersonate=${caller.id}`}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-[#F95721] hover:text-white text-[#111110] dark:text-[#F5F3EF] text-xs font-semibold transition-all group"
                    title={`Mirror view of ${caller.full_name}'s dial queue`}
                  >
                    <ExternalLink className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
                    <span>Mirror View</span>
                  </Link>

                  <button
                    type="button"
                    onClick={() => handleOpenResetModal(caller)}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-[#6E6B66] dark:text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF] text-xs font-medium transition-all"
                    title={`Set temporary password for ${caller.full_name}`}
                  >
                    <KeyRound className="w-3.5 h-3.5 text-[#F95721]" />
                    <span>Reset Pass</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Temporary Password Reset Modal */}
      {targetCaller && (
        <div className="fixed inset-0 z-[400] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className="w-full max-w-md rounded-3xl bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] shadow-2xl p-6 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-3 border-b border-[#ECE8E1] dark:border-[#2D2924]">
              <div>
                <span className="text-[10px] font-mono tracking-widest uppercase text-[#F95721] font-semibold">
                  SECURITY OVERRIDE
                </span>
                <h3 className="text-lg font-black text-[#111110] dark:text-[#F5F3EF] tracking-tight mt-0.5">
                  Set Temporary Password
                </h3>
              </div>
              <button
                type="button"
                onClick={handleCloseResetModal}
                className="p-1 rounded-xl text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF] hover:bg-black/5 dark:hover:bg-white/5"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Target Identity Summary */}
            <div className="my-4 p-3 rounded-2xl bg-black/5 dark:bg-white/5 flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-[#F95721]/10 flex items-center justify-center font-bold text-xs text-[#F95721]">
                {targetCaller.full_name[0]?.toUpperCase() || "C"}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-[#111110] dark:text-[#F5F3EF] truncate">
                  {targetCaller.full_name}
                </p>
                <p className="text-[11px] text-[#6E6B66] dark:text-[#8A8680] truncate">
                  {targetCaller.email}
                </p>
              </div>
            </div>

            {resetSuccess ? (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{resetSuccess}</span>
                </div>

                <div className="p-3 rounded-2xl bg-black/5 dark:bg-white/5 border border-[#ECE8E1] dark:border-[#2D2924] flex items-center justify-between">
                  <span className="font-mono text-sm font-bold text-[#111110] dark:text-[#F5F3EF]">
                    {tempPassword}
                  </span>
                  <button
                    type="button"
                    onClick={copyPasswordToClipboard}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#F95721] text-white text-xs font-semibold"
                  >
                    {copiedPassword ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedPassword ? "Copied" : "Copy"}</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleCloseResetModal}
                  className="w-full py-2.5 rounded-2xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-xs font-semibold text-[#111110] dark:text-[#F5F3EF]"
                >
                  Close
                </button>
              </div>
            ) : (
              <form onSubmit={handleExecutePasswordReset} className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-[#111110] dark:text-[#F5F3EF]">
                      Temporary Password
                    </label>
                    <button
                      type="button"
                      onClick={() => setTempPassword(generateTemporaryPassword())}
                      className="text-[11px] text-[#F95721] hover:underline font-mono"
                    >
                      Regenerate
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    value={tempPassword}
                    onChange={(e) => setTempPassword(e.target.value)}
                    className="w-full font-mono text-sm px-4 py-2.5 bg-black/5 dark:bg-white/5 border border-[#ECE8E1] dark:border-[#2D2924] focus:border-[#F95721] rounded-2xl text-[#111110] dark:text-[#F5F3EF] outline-none"
                    placeholder="Enter temporary password..."
                  />
                  <p className="text-[11px] text-[#6E6B66] dark:text-[#8A8680] mt-1">
                    Minimum 8 characters. The caller will be forced to change this upon login (`require_password_change = true`).
                  </p>
                </div>

                {resetError && (
                  <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{resetError}</span>
                  </div>
                )}

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={handleCloseResetModal}
                    disabled={isResetting}
                    className="flex-1 py-2.5 rounded-2xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-xs font-semibold text-[#6E6B66] dark:text-[#8A8680] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isResetting || !tempPassword.trim()}
                    className="flex-1 py-2.5 rounded-2xl bg-[#F95721] hover:opacity-90 disabled:opacity-50 text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                  >
                    {isResetting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                    <span>{isResetting ? "Updating..." : "Issue Temp Password"}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
