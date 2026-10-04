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
  Inbox,
  UserCheck,
  Radio,
  Zap,
  ArrowUpDown,
  SlidersHorizontal,
  ChevronRight,
  PhoneForwarded,
  FileText,
  Calendar,
  Shield,
  PhoneOff,
  UserX,
  Hourglass,
  Layers,
  ArrowRight,
  Sparkles,
  AlertTriangle,
  UserCog,
  Crown,
  ChevronDown,
} from "lucide-react";

interface OutcomeBreakdown {
  interested: number;
  callback: number;
  no_answer: number;
  gatekeeper: number;
  not_interested: number;
  dnc: number;
}

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
  connect_rate_percent: number | null;
  interested_today: number;
  callbacks_today: number;
  talk_time_seconds: number;
  active_leads_count: number;
  outcomes_breakdown: OutcomeBreakdown;
}

interface TeamSummary {
  total_dials_today: number;
  total_connects_today: number;
  total_talk_time_seconds: number;
  total_pipeline_escalations: number;
  total_callbacks_today: number;
  total_rejections_today: number;
  total_no_answer_today: number;
  active_callers: number;
  total_callers: number;
  connect_rate_percent: number | null;
}

interface CallLedgerItem {
  id: string;
  called_at: string;
  outcome: string;
  duration_seconds: number;
  notes: string | null;
  callback_at: string | null;
  lead: {
    id: string;
    name: string;
    phone: string;
    niche: string;
    area: string;
    status: string;
    attempts_count: number;
  } | null;
}

interface CallerActivityDetail {
  caller: CallerStat;
  summary: {
    total_dials: number;
    connects: number;
    connect_rate: number | null;
    talk_time_seconds: number;
    active_queue_count: number;
  };
  calls: CallLedgerItem[];
  active_leads: any[];
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

function formatTimeAgo(date: Date): string {
  const diffSec = Math.round((Date.now() - date.getTime()) / 1000);
  if (diffSec < 15) return "Updated just now";
  if (diffSec < 60) return `Updated ${diffSec}s ago`;
  const mins = Math.floor(diffSec / 60);
  return `Updated ${mins}m ago`;
}

function formatPhoneDisplay(phone: string | null | undefined): string {
  if (!phone) return "No Phone";
  const cleaned = phone.trim().replace(/\D/g, "");
  let core10 = cleaned;
  if (cleaned.length === 11 && cleaned.startsWith("0")) core10 = cleaned.slice(1);
  else if (cleaned.length === 12 && cleaned.startsWith("91")) core10 = cleaned.slice(2);
  if (core10.length === 10) return `+91 ${core10.slice(0, 5)} ${core10.slice(5)}`;
  return phone;
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
    total_talk_time_seconds: 0,
    total_pipeline_escalations: 0,
    total_callbacks_today: 0,
    total_rejections_today: 0,
    total_no_answer_today: 0,
    active_callers: 0,
    total_callers: 0,
    connect_rate_percent: null,
  });
  const [quarantineCount, setQuarantineCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "online" | "offline">("all");
  const [sortBy, setSortBy] = useState<"queue" | "dials" | "connects" | "name">("queue");
  const [timeRange, setTimeRange] = useState<"today" | "24h">("today");
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

  // Caller detail drawer state
  const [detailCallerId, setDetailCallerId] = useState<string | null>(null);
  const [detailData, setDetailData] = useState<CallerActivityDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTab, setDetailTab] = useState<"calls" | "queue">("calls");

  // Rebalance modal state
  const [rebalanceModalOpen, setRebalanceModalOpen] = useState(false);
  const [rebalanceSource, setRebalanceSource] = useState<string>("");
  const [rebalanceTarget, setRebalanceTarget] = useState<string>("");
  const [rebalanceCount, setRebalanceCount] = useState<number>(10);
  const [rebalancing, setRebalancing] = useState(false);
  const [rebalanceError, setRebalanceError] = useState<string | null>(null);
  const [rebalanceSuccess, setRebalanceSuccess] = useState<string | null>(null);

  // Lead distribution state
  const [distributing, setDistributing] = useState(false);
  const [distributeNotification, setDistributeNotification] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [distributeDropdownOpen, setDistributeDropdownOpen] = useState(false);

  // Role change modal state
  const [roleModalCaller, setRoleModalCaller] = useState<CallerStat | null>(null);
  const [selectedNewRole, setSelectedNewRole] = useState<string>("caller");
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);
  const [roleUpdateError, setRoleUpdateError] = useState<string | null>(null);
  const [roleUpdateSuccess, setRoleUpdateSuccess] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<"all" | "caller" | "manager" | "developer" | "admin">("all");

  const fetchTeamStats = useCallback(
    async (isManual: boolean = false) => {
      if (isManual) {
        setRefreshing(true);
      }
      try {
        const res = await fetch(`/api/manager/team-stats?range=${timeRange}`);
        if (res.ok) {
          const data = await res.json();
          setCallers(data.callers || []);
          if (data.summary) {
            setSummary(data.summary);
          }
          if (typeof data.quarantine_count === "number") {
            setQuarantineCount(data.quarantine_count);
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
    },
    [timeRange]
  );

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

  // Fetch Caller Activity Detail when drawer is opened
  const openCallerDetail = async (callerId: string) => {
    setDetailCallerId(callerId);
    setDetailLoading(true);
    setDetailTab("calls");
    try {
      const res = await fetch(`/api/manager/caller-activity?caller_id=${callerId}`);
      if (res.ok) {
        const data = await res.json();
        setDetailData(data);
      } else {
        console.error("Failed to load caller detail");
      }
    } catch (err) {
      console.error("Error loading caller detail:", err);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeCallerDetail = () => {
    setDetailCallerId(null);
    setDetailData(null);
  };

  // Filtered & Sorted callers list
  const filteredCallers = useMemo(() => {
    const list = callers.filter((c) => {
      const matchesSearch =
        c.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.email.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      if (statusFilter === "online") return c.is_online;
      if (statusFilter === "offline") return !c.is_online;

      if (roleFilter !== "all" && c.role !== roleFilter) return false;

      return true;
    });

    list.sort((a, b) => {
      if (sortBy === "queue") return b.active_leads_count - a.active_leads_count;
      if (sortBy === "dials") return b.dials_today - a.dials_today;
      if (sortBy === "connects") return b.connects_today - a.connects_today;
      if (sortBy === "name") return a.full_name.localeCompare(b.full_name);
      return 0;
    });

    return list;
  }, [callers, searchQuery, statusFilter, roleFilter, sortBy]);

  // Proactive Queue Imbalance Detection (> 1.5x team average over callers only)
  const teamAverageLeads = useMemo(() => {
    const onlyCallers = callers.filter((c) => c.role === "caller");
    if (onlyCallers.length === 0) return 0;
    const total = onlyCallers.reduce((acc, c) => acc + c.active_leads_count, 0);
    return Math.round(total / onlyCallers.length);
  }, [callers]);

  const overloadedCaller = useMemo(() => {
    const onlyCallers = callers.filter((c) => c.role === "caller");
    return onlyCallers.find(
      (c) => c.active_leads_count > Math.max(10, Math.ceil(teamAverageLeads * 1.5))
    );
  }, [callers, teamAverageLeads]);

  const lightestCaller = useMemo(() => {
    const onlyCallers = callers.filter((c) => c.role === "caller");
    if (onlyCallers.length === 0) return null;
    return [...onlyCallers].sort((a, b) => a.active_leads_count - b.active_leads_count)[0];
  }, [callers]);

  async function handleDistributeNow() {
    setDistributing(true);
    setDistributeNotification(null);
    try {
      const res = await fetch("/api/manager/leads/distribute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_cap: 30 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to distribute leads");
      setDistributeNotification({
        type: "success",
        text: data.message || `Distributed ${data.assigned_count} leads successfully!`,
      });
      await fetchTeamStats(true);
    } catch (err: any) {
      setDistributeNotification({
        type: "error",
        text: err.message || "Failed to distribute leads",
      });
    } finally {
      setDistributing(false);
      setTimeout(() => setDistributeNotification(null), 5000);
    }
  }

  function handleOpenResetModal(caller: CallerStat, e?: React.MouseEvent) {
    if (e) e.stopPropagation();
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
        `Temporary password for ${targetCaller.full_name} set successfully. The caller will be prompted to choose a permanent password upon their next login.`
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

  function handleOpenRoleModal(caller: CallerStat, e?: React.MouseEvent) {
    if (e) e.stopPropagation();
    setRoleModalCaller(caller);
    setSelectedNewRole(caller.role || "caller");
    setRoleUpdateError(null);
    setRoleUpdateSuccess(null);
  }

  function handleCloseRoleModal() {
    setRoleModalCaller(null);
    setRoleUpdateError(null);
    setRoleUpdateSuccess(null);
  }

  async function handleExecuteRoleChange(e: React.FormEvent) {
    e.preventDefault();
    if (!roleModalCaller || isUpdatingRole) return;

    if (selectedNewRole === roleModalCaller.role) {
      handleCloseRoleModal();
      return;
    }

    setIsUpdatingRole(true);
    setRoleUpdateError(null);
    setRoleUpdateSuccess(null);

    try {
      const res = await fetch("/api/manager/team/role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: roleModalCaller.id,
          newRole: selectedNewRole,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to update role");
      }

      setRoleUpdateSuccess(
        data.message || `Successfully updated ${roleModalCaller.full_name}'s role to ${selectedNewRole.toUpperCase()}.`
      );

      // Optimistically update caller in local state
      setCallers((prev) =>
        prev.map((c) =>
          c.id === roleModalCaller.id ? { ...c, role: selectedNewRole } : c
        )
      );

      setTimeout(() => {
        handleCloseRoleModal();
      }, 1400);
    } catch (err: any) {
      setRoleUpdateError(err.message || "An unexpected error occurred while updating role");
    } finally {
      setIsUpdatingRole(false);
    }
  }

  // Handle Rebalance Execution
  async function handleExecuteRebalance(e: React.FormEvent) {
    e.preventDefault();
    if (!rebalanceSource || !rebalanceTarget) {
      setRebalanceError("Please select both source and target callers");
      return;
    }
    if (rebalanceSource === rebalanceTarget) {
      setRebalanceError("Source and target callers cannot be the same");
      return;
    }
    if (rebalanceCount <= 0) {
      setRebalanceError("Lead count must be at least 1");
      return;
    }

    setRebalancing(true);
    setRebalanceError(null);
    setRebalanceSuccess(null);

    try {
      const res = await fetch("/api/manager/leads/rebalance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_caller_id: rebalanceSource,
          target_caller_id: rebalanceTarget,
          count: rebalanceCount,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Failed to rebalance leads");
      }

      setRebalanceSuccess(`Successfully transferred ${data.rebalanced_count} leads!`);
      await fetchTeamStats(true);
      setTimeout(() => {
        setRebalanceModalOpen(false);
        setRebalanceSuccess(null);
      }, 1500);
    } catch (err: any) {
      setRebalanceError(err.message || "An unexpected error occurred during rebalance");
    } finally {
      setRebalancing(false);
    }
  }

  function openRebalanceModalWithCaller(sourceCallerId?: string) {
    setRebalanceError(null);
    setRebalanceSuccess(null);
    const onlyCallers = callers.filter((c) => c.role === "caller");
    if (sourceCallerId) {
      setRebalanceSource(sourceCallerId);
      // Select first other caller as target
      const other = onlyCallers.find((c) => c.id !== sourceCallerId);
      if (other) setRebalanceTarget(other.id);
    } else {
      // Default: Highest queue caller to lowest queue caller
      const sorted = [...onlyCallers].sort((a, b) => b.active_leads_count - a.active_leads_count);
      if (sorted.length >= 2) {
        setRebalanceSource(sorted[0].id);
        setRebalanceTarget(sorted[sorted.length - 1].id);
      }
    }
    setRebalanceCount(10);
    setRebalanceModalOpen(true);
  }

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-16">
      {/* Header & Sub-Navigation */}
      <div className="pb-4 border-b border-[#ECE8E1] dark:border-[#2D2924] pt-2 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <span className="text-[11px] font-mono tracking-widest uppercase text-[#F95721] font-semibold">
            TEAM COMMAND CENTER
          </span>
          <h1 className="text-3xl sm:text-4xl font-black text-[#111110] dark:text-[#F5F3EF] tracking-tight mt-1">
            Caller roster & telemetry
          </h1>
          <p className="text-xs text-[#6E6B66] dark:text-[#8A8680] mt-1.5 flex items-center gap-2">
            <span>Monitor daily caller output, live talk time, queue depth, and rebalance leads.</span>
            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/5 border border-[#ECE8E1] dark:border-[#2D2924]">
              IST (UTC+5:30)
            </span>
          </p>
        </div>

        {/* Manager Navigation Pills with Live Quarantine Badge */}
        <div className="flex items-center gap-1.5 p-1 bg-black/5 dark:bg-white/5 rounded-2xl border border-[#ECE8E1] dark:border-[#2D2924] shrink-0 self-start md:self-auto overflow-x-auto max-w-full">
          <Link
            href="/studio/manager/team"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#F95721] text-white shadow-sm transition-all"
          >
            <Users className="w-3.5 h-3.5" />
            <span>Team Roster</span>
          </Link>
          <Link
            href="/studio/manager/quarantine"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-[#6E6B66] dark:text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF] transition-all"
          >
            <Inbox className="w-3.5 h-3.5" />
            <span>Quarantine</span>
            {quarantineCount > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-red-500/10 text-red-500 border border-red-500/20 font-bold">
                {quarantineCount}
              </span>
            )}
          </Link>
          <Link
            href="/studio/manager/invites"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-[#6E6B66] dark:text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF] transition-all"
          >
            <span>Invites</span>
          </Link>
          <Link
            href="/studio/manager/ingestion"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-[#6E6B66] dark:text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF] transition-all"
          >
            <span>CSV Ingestion</span>
          </Link>
        </div>
      </div>

      {/* Telemetry Status Bar & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-mono">
            <Radio className="w-4 h-4 animate-pulse" />
            <span>Live telemetry</span>
          </div>
          <span className="text-[#6E6B66] dark:text-[#8A8680]">&bull;</span>
          <span className="text-[#6E6B66] dark:text-[#8A8680] font-mono">
            {formatTimeAgo(lastRefreshedAt)}
          </span>

          {/* Time Range Selector */}
          <div className="flex items-center p-0.5 bg-black/5 dark:bg-white/5 rounded-xl border border-[#ECE8E1] dark:border-[#2D2924] ml-2">
            <button
              type="button"
              onClick={() => setTimeRange("today")}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
                timeRange === "today"
                  ? "bg-white dark:bg-[#1C1A17] text-[#111110] dark:text-[#F5F3EF] shadow-sm font-semibold"
                  : "text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF]"
              }`}
            >
              Today (IST)
            </button>
            <button
              type="button"
              onClick={() => setTimeRange("24h")}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
                timeRange === "24h"
                  ? "bg-white dark:bg-[#1C1A17] text-[#111110] dark:text-[#F5F3EF] shadow-sm font-semibold"
                  : "text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF]"
              }`}
            >
              Last 24h
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          {/* Merged Lead Operations Dropdown: [ ⚖️ Distribute ▾ ] */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setDistributeDropdownOpen((prev) => !prev)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#F95721] hover:bg-[#E04612] text-white font-semibold text-xs transition-all shadow-sm active:scale-95"
            >
              <span>⚖️ Distribute</span>
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${distributeDropdownOpen ? "rotate-180" : ""}`} />
            </button>

            {distributeDropdownOpen && (
              <div
                className="absolute right-0 top-full mt-1.5 w-64 rounded-2xl bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] shadow-2xl p-1.5 z-[150] animate-in fade-in zoom-in-95 duration-100"
                onClick={() => setDistributeDropdownOpen(false)}
              >
                <button
                  type="button"
                  onClick={handleDistributeNow}
                  disabled={distributing}
                  className="w-full p-2.5 rounded-xl hover:bg-emerald-500/10 text-left flex items-start gap-2.5 transition-colors group"
                >
                  <Sparkles className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-[#111110] dark:text-[#F5F3EF] group-hover:text-emerald-600 dark:group-hover:text-emerald-400">
                      {distributing ? "Distributing..." : "Distribute Unassigned"}
                    </p>
                    <p className="text-[10px] text-[#6E6B66] dark:text-[#8A8680] leading-tight mt-0.5">
                      Assign unassigned leads to callers (depth-capped at 30)
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => openRebalanceModalWithCaller()}
                  className="w-full p-2.5 rounded-xl hover:bg-[#F95721]/10 text-left flex items-start gap-2.5 transition-colors group mt-1"
                >
                  <PhoneForwarded className="w-4 h-4 text-[#F95721] shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-[#111110] dark:text-[#F5F3EF] group-hover:text-[#F95721]">
                      Rebalance Overloaded
                    </p>
                    <p className="text-[10px] text-[#6E6B66] dark:text-[#8A8680] leading-tight mt-0.5">
                      Shift excess leads from heavy callers to lightest callers
                    </p>
                  </div>
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-2.5 py-1.5 rounded-xl font-mono text-[11px] transition-all flex items-center gap-1.5 ${
              autoRefresh
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                : "bg-black/5 dark:bg-white/5 text-[#8A8680] border border-transparent"
            }`}
            title={autoRefresh ? "Auto-refreshing every 30 seconds" : "Auto-refresh paused"}
          >
            <span>Auto: {autoRefresh ? `${countdown}s` : "Off"}</span>
          </button>

          <button
            type="button"
            onClick={() => fetchTeamStats(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] hover:border-[#F95721] text-[#111110] dark:text-[#F5F3EF] shadow-sm transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-[#F95721]" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Distribution Notification Toast */}
      {distributeNotification && (
        <div
          className={`p-3.5 rounded-2xl text-xs font-semibold flex items-center justify-between border shadow-sm animate-in fade-in ${
            distributeNotification.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
              : "bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300"
          }`}
        >
          <div className="flex items-center gap-2">
            {distributeNotification.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            )}
            <span>{distributeNotification.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setDistributeNotification(null)}
            className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 text-stone-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Proactive Queue Imbalance Alert Banner (Triggered when any caller > 1.5x team average) */}
      {overloadedCaller && lightestCaller && overloadedCaller.id !== lightestCaller.id && (
        <div className="p-4 sm:p-5 rounded-3xl bg-amber-500/10 border border-amber-500/30 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm animate-in fade-in">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                  QUEUE IMBALANCE DETECTED
                </span>
                <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-800 dark:text-amber-300 font-bold border border-amber-500/30">
                  &gt; 1.5x TEAM AVERAGE
                </span>
              </div>
              <p className="text-xs text-[#111110] dark:text-[#F5F3EF] mt-0.5">
                <strong className="text-amber-600 dark:text-amber-400">{overloadedCaller.full_name}</strong> currently holds{" "}
                <strong>{overloadedCaller.active_leads_count} leads</strong> while the team average is{" "}
                <strong>{teamAverageLeads} leads</strong>. {lightestCaller.full_name} has only{" "}
                <strong>{lightestCaller.active_leads_count} leads</strong>.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              const excess = Math.max(5, overloadedCaller.active_leads_count - teamAverageLeads);
              setRebalanceSource(overloadedCaller.id);
              setRebalanceTarget(lightestCaller.id);
              setRebalanceCount(excess);
              setRebalanceModalOpen(true);
            }}
            className="px-4 py-2.5 rounded-2xl bg-[#F95721] hover:bg-[#e04816] text-white text-xs font-bold transition-all shadow-sm flex items-center gap-2 shrink-0 active:scale-95 self-start md:self-auto"
          >
            <PhoneForwarded className="w-4 h-4" />
            <span>Proactive Rebalance ({Math.max(5, overloadedCaller.active_leads_count - teamAverageLeads)} Leads) &rarr;</span>
          </button>
        </div>
      )}

      {/* KPI Metric Cards — Real Numbers, Team-Level Totals */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {/* Card 1: Total Dials Today */}
        <div className="p-4 rounded-3xl bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#6E6B66] dark:text-[#8A8680] font-semibold">
              Total Dials
            </span>
            <div className="w-7 h-7 rounded-2xl bg-orange-500/10 flex items-center justify-center text-orange-500">
              <PhoneCall className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-3xl font-black text-[#111110] dark:text-[#F5F3EF] tracking-tight">
              {summary.total_dials_today}
            </h3>
            <p className="text-[10px] text-[#6E6B66] dark:text-[#8A8680] mt-0.5">
              Outbound attempts across team
            </p>
          </div>
        </div>

        {/* Card 2: Total Connects (Kill % until >= 20 dials) */}
        <div className="p-4 rounded-3xl bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#6E6B66] dark:text-[#8A8680] font-semibold">
              Total Connects
            </span>
            <div className="w-7 h-7 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
              <Zap className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-2">
              <h3 className="text-3xl font-black text-[#111110] dark:text-[#F5F3EF] tracking-tight">
                {summary.total_connects_today}
              </h3>
              {summary.connect_rate_percent !== null && (
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                  {summary.connect_rate_percent}%
                </span>
              )}
            </div>
            <p className="text-[10px] text-[#6E6B66] dark:text-[#8A8680] mt-0.5">
              Live human conversations
            </p>
          </div>
        </div>

        {/* Card 3: Total Talk Time */}
        <div className="p-4 rounded-3xl bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#6E6B66] dark:text-[#8A8680] font-semibold">
              Total Talk Time
            </span>
            <div className="w-7 h-7 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-500">
              <Clock className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-3xl font-black text-[#111110] dark:text-[#F5F3EF] tracking-tight">
              {formatDuration(summary.total_talk_time_seconds)}
            </h3>
            <p className="text-[10px] text-[#6E6B66] dark:text-[#8A8680] mt-0.5">
              Cumulative team call duration
            </p>
          </div>
        </div>

        {/* Card 4: Hot Escalations */}
        <div className="p-4 rounded-3xl bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#6E6B66] dark:text-[#8A8680] font-semibold">
              Hot Escalations
            </span>
            <div className="w-7 h-7 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-500">
              <Flame className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-3xl font-black text-[#111110] dark:text-[#F5F3EF] tracking-tight">
              {summary.total_pipeline_escalations}
            </h3>
            <p className="text-[10px] text-[#6E6B66] dark:text-[#8A8680] mt-0.5">
              Qualified deals marked interested
            </p>
          </div>
        </div>

        {/* Card 5: Active Callers */}
        <div className="p-4 rounded-3xl bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#6E6B66] dark:text-[#8A8680] font-semibold">
              Active Callers
            </span>
            <div className="w-7 h-7 rounded-2xl bg-purple-500/10 flex items-center justify-center text-purple-500">
              <UserCheck className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-2">
              <h3 className="text-3xl font-black text-[#111110] dark:text-[#F5F3EF] tracking-tight">
                {summary.active_callers}
              </h3>
              <span className="text-xs text-[#8A8680] font-mono">
                / {summary.total_callers || callers.filter((c) => c.role === "caller").length} callers
              </span>
            </div>
            <p className="text-[10px] text-[#6E6B66] dark:text-[#8A8680] mt-0.5">
              Available & logged in now
            </p>
          </div>
        </div>
      </div>

      {/* Filter, Search & Sort Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8A8680]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search callers by name or email..."
              className="w-full pl-10 pr-4 py-2 bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] focus:border-[#F95721] rounded-2xl text-xs text-[#111110] dark:text-[#F5F3EF] outline-none shadow-sm transition-all"
            />
          </div>

          {/* Sort Dropdown */}
          <div className="relative">
            <select
              value={sortBy}
              onChange={(e: any) => setSortBy(e.target.value)}
              className="px-3 py-2 bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] rounded-2xl text-xs text-[#111110] dark:text-[#F5F3EF] outline-none shadow-sm cursor-pointer font-medium"
            >
              <option value="queue">Sort: Queue Depth</option>
              <option value="dials">Sort: Most Dials</option>
              <option value="connects">Sort: Connects</option>
              <option value="name">Sort: Name (A-Z)</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
          {/* Role Filter Tabs */}
          <div className="flex items-center gap-1 p-1 bg-white dark:bg-[#1C1A17] rounded-2xl border border-[#ECE8E1] dark:border-[#2D2924] shadow-sm text-xs">
            <button
              type="button"
              onClick={() => setRoleFilter("all")}
              className={`px-3 py-1.5 rounded-xl font-medium transition-all ${
                roleFilter === "all"
                  ? "bg-[#111110] dark:bg-[#F5F3EF] text-white dark:text-[#111110]"
                  : "text-[#6E6B66] dark:text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF]"
              }`}
            >
              All Roles ({callers.length})
            </button>
            <button
              type="button"
              onClick={() => setRoleFilter("caller")}
              className={`px-2.5 py-1.5 rounded-xl font-medium transition-all flex items-center gap-1 ${
                roleFilter === "caller"
                  ? "bg-[#F95721] text-white"
                  : "text-[#6E6B66] dark:text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF]"
              }`}
            >
              <span>Callers</span>
              <span className="text-[10px] font-mono opacity-80">({callers.filter((c) => c.role === "caller").length})</span>
            </button>
            <button
              type="button"
              onClick={() => setRoleFilter("manager")}
              className={`px-2.5 py-1.5 rounded-xl font-medium transition-all flex items-center gap-1 ${
                roleFilter === "manager"
                  ? "bg-purple-600 text-white"
                  : "text-[#6E6B66] dark:text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF]"
              }`}
            >
              <span>Managers</span>
              <span className="text-[10px] font-mono opacity-80">({callers.filter((c) => c.role === "manager").length})</span>
            </button>
          </div>

          {/* Status Filter Tabs */}
          <div className="flex items-center gap-1.5 p-1 bg-white dark:bg-[#1C1A17] rounded-2xl border border-[#ECE8E1] dark:border-[#2D2924] shadow-sm text-xs">
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={`px-3 py-1.5 rounded-xl font-medium transition-all ${
                statusFilter === "all"
                  ? "bg-[#111110] dark:bg-[#F5F3EF] text-white dark:text-[#111110]"
                  : "text-[#6E6B66] dark:text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF]"
              }`}
            >
              All Status
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("online")}
              className={`px-2.5 py-1.5 rounded-xl font-medium transition-all flex items-center gap-1.5 ${
                statusFilter === "online"
                  ? "bg-emerald-600 text-white"
                  : "text-[#6E6B66] dark:text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF]"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>Online</span>
              <span className="text-[10px] font-mono opacity-80">({callers.filter((c) => c.is_online).length})</span>
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("offline")}
              className={`px-2.5 py-1.5 rounded-xl font-medium transition-all flex items-center gap-1.5 ${
                statusFilter === "offline"
                  ? "bg-stone-700 text-white"
                  : "text-[#6E6B66] dark:text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF]"
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-stone-400" />
              <span>Offline</span>
              <span className="text-[10px] font-mono opacity-80">({callers.filter((c) => !c.is_online).length})</span>
            </button>
          </div>
        </div>
      </div>

      {/* Caller Cards Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="p-6 rounded-3xl bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] animate-pulse space-y-4"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-black/5 dark:bg-white/5" />
                <div className="space-y-2 flex-1">
                  <div className="h-4 bg-black/5 dark:bg-white/5 rounded w-1/2" />
                  <div className="h-3 bg-black/5 dark:bg-white/5 rounded w-3/4" />
                </div>
              </div>
              <div className="h-16 bg-black/5 dark:bg-white/5 rounded-2xl" />
            </div>
          ))}
        </div>
      ) : filteredCallers.length === 0 ? (
        <div className="text-center py-16 px-4 bg-white dark:bg-[#1C1A17] rounded-3xl border border-[#ECE8E1] dark:border-[#2D2924] space-y-3">
          <Users className="w-10 h-10 text-[#8A8680] mx-auto opacity-50" />
          <h3 className="text-base font-bold text-[#111110] dark:text-[#F5F3EF]">
            No callers match current filters
          </h3>
          <p className="text-xs text-[#6E6B66] dark:text-[#8A8680]">
            Try adjusting your search query or status filter.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCallers.map((caller) => {
            const initials = caller.full_name
              .split(" ")
              .map((n) => n[0])
              .join("")
              .toUpperCase()
              .slice(0, 2);

            return (
              <div
                key={caller.id}
                onClick={() => openCallerDetail(caller.id)}
                className="p-5 rounded-3xl bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] shadow-sm hover:border-[#F95721]/50 hover:shadow-md transition-all flex flex-col justify-between cursor-pointer group"
              >
                <div>
                  {/* Top: Avatar, Name, Email, Real Status */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative shrink-0">
                        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#F95721] to-[#FF8A65] p-0.5 shadow-sm">
                          <div className="w-full h-full rounded-[14px] bg-white dark:bg-[#1C1A17] flex items-center justify-center font-bold text-xs text-[#F95721]">
                            {initials}
                          </div>
                        </div>
                        {/* Live Status Dot Indicator */}
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-[#1C1A17] ${
                            caller.is_online
                              ? "bg-emerald-500 shadow-sm"
                              : "bg-stone-400"
                          }`}
                          title={caller.is_online ? "🟢 Idle & Available" : "⚫ Offline"}
                        />
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-[#111110] dark:text-[#F5F3EF] truncate group-hover:text-[#F95721] transition-colors">
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
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <button
                            type="button"
                            onClick={(e) => handleOpenRoleModal(caller, e)}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase transition-all hover:scale-105 active:scale-95 ${
                              caller.role === "manager"
                                ? "bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30"
                                : caller.role === "developer"
                                ? "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30"
                                : caller.role === "admin"
                                ? "bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                                : "bg-[#F95721]/15 text-[#F95721] border border-[#F95721]/30"
                            }`}
                            title="Click to change teammate role"
                          >
                            <Shield className="w-2.5 h-2.5" />
                            <span>{caller.role}</span>
                            <span className="text-[9px] opacity-60">✏️</span>
                          </button>
                        </div>
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

                  {/* Outcome Breakdown (Missing 6 — The Coaching Signal) */}
                  <div className="mt-3 p-2 rounded-2xl bg-black/[0.02] dark:bg-white/[0.02] border border-[#ECE8E1]/60 dark:border-[#2D2924]/60">
                    <div className="text-[9px] font-mono uppercase tracking-wider text-[#8A8680] mb-1.5 flex items-center justify-between">
                      <span>Today&apos;s Outcomes</span>
                      <span>Total: {caller.dials_today}</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap text-[11px] font-medium">
                      <span
                        className="px-2 py-0.5 rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20"
                        title="Interested deals"
                      >
                        🔥 {caller.outcomes_breakdown?.interested || 0}
                      </span>
                      <span
                        className="px-2 py-0.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"
                        title="Callbacks scheduled"
                      >
                        📞 {caller.outcomes_breakdown?.callback || 0}
                      </span>
                      <span
                        className="px-2 py-0.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                        title="No Answer (Cadence)"
                      >
                        ⏳ {caller.outcomes_breakdown?.no_answer || 0}
                      </span>
                      <span
                        className="px-2 py-0.5 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20"
                        title="Gatekeeper"
                      >
                        🛡️ {caller.outcomes_breakdown?.gatekeeper || 0}
                      </span>
                      <span
                        className="px-2 py-0.5 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20"
                        title="Rejected / Quarantine"
                      >
                        ❌ {caller.outcomes_breakdown?.not_interested || 0}
                      </span>
                    </div>
                  </div>

                  {/* Queue Depth & Rebalance Shortcut */}
                  <div className="mt-3 flex items-center justify-between text-xs px-1 text-[#6E6B66] dark:text-[#8A8680]">
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-[#F95721]" />
                      <span>Queue Active:</span>
                      <strong className="text-[#111110] dark:text-[#F5F3EF]">
                        {caller.active_leads_count} leads
                      </strong>
                    </span>

                    {caller.role === "caller" && caller.active_leads_count > 0 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openRebalanceModalWithCaller(caller.id);
                        }}
                        className="text-[11px] font-semibold text-[#F95721] hover:underline flex items-center gap-1"
                      >
                        <PhoneForwarded className="w-3 h-3" />
                        <span>Shift</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Card Actions: Mirror View, Activity Ledger, De-emphasized Reset Pass */}
                <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-[#ECE8E1] dark:border-[#2D2924]" onClick={(e) => e.stopPropagation()}>
                  {caller.role === "caller" ? (
                    <Link
                      href={`/studio/queue?impersonate=${caller.id}`}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-[#F95721] hover:text-white text-[#111110] dark:text-[#F5F3EF] text-xs font-semibold transition-all group/btn"
                      title={`Mirror view of ${caller.full_name}'s dial queue`}
                    >
                      <ExternalLink className="w-3.5 h-3.5 group-hover/btn:scale-110 transition-transform" />
                      <span>Mirror View</span>
                    </Link>
                  ) : (
                    <div
                      className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] text-[#8A8680] text-xs font-medium border border-dashed border-[#ECE8E1] dark:border-[#2D2924]"
                      title="Teammate is in management and does not hold a dial queue"
                    >
                      <Shield className="w-3.5 h-3.5 text-purple-500" />
                      <span className="capitalize">{caller.role}</span>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => openCallerDetail(caller.id)}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-[#111110] dark:text-[#F5F3EF] text-xs font-semibold transition-all"
                  >
                    <FileText className="w-3.5 h-3.5 text-[#F95721]" />
                    <span>Activity</span>
                  </button>
                </div>

                {/* Secondary De-emphasized Actions: Change Role & Reset Password */}
                <div className="mt-2.5 pt-2 border-t border-[#ECE8E1]/60 dark:border-[#2D2924]/60 flex items-center justify-between px-1" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={(e) => handleOpenRoleModal(caller, e)}
                    className="text-[10px] text-[#8A8680] hover:text-[#F95721] font-mono flex items-center gap-1 transition-colors"
                    title="Change workspace role"
                  >
                    <UserCog className="w-3 h-3 text-[#F95721]" />
                    <span>Change Role</span>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => handleOpenResetModal(caller, e)}
                    className="text-[10px] text-[#8A8680] hover:text-amber-500 font-mono flex items-center gap-1 transition-colors"
                  >
                    <KeyRound className="w-3 h-3" />
                    <span>Reset Credentials</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ========================================================================= */}
      {/* CALLER ACTIVITY LEDGER DRAWER / SLIDE-OVER (Missing 7 — The Tracking Fix) */}
      {/* ========================================================================= */}
      {detailCallerId && (
        <div className="fixed inset-0 z-[400] bg-black/50 backdrop-blur-sm flex justify-end">
          <div
            className="w-full max-w-xl h-full bg-white dark:bg-[#1C1A17] border-l border-[#ECE8E1] dark:border-[#2D2924] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="p-5 border-b border-[#ECE8E1] dark:border-[#2D2924] flex items-start justify-between gap-4 bg-black/[0.01] dark:bg-white/[0.01]">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#F95721] to-[#FF8A65] p-0.5">
                  <div className="w-full h-full rounded-[14px] bg-white dark:bg-[#1C1A17] flex items-center justify-center font-bold text-sm text-[#F95721]">
                    {detailData?.caller.full_name?.slice(0, 2).toUpperCase() || "CL"}
                  </div>
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#111110] dark:text-[#F5F3EF]">
                    {detailData?.caller.full_name || "Caller Activity"}
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-xs text-[#6E6B66] dark:text-[#8A8680]">
                      {detailData?.caller.email}
                    </p>
                    {detailData?.caller && (
                      <button
                        type="button"
                        onClick={() => handleOpenRoleModal(detailData.caller)}
                        className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-[#F95721]/15 text-[#F95721] hover:bg-[#F95721]/25 transition-colors flex items-center gap-1"
                        title="Change role"
                      >
                        <Shield className="w-2.5 h-2.5" />
                        <span>{detailData.caller.role}</span>
                        <span className="text-[9px] opacity-70">✏️</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Link
                  href={`/queue?impersonate=${detailCallerId}`}
                  className="px-3 py-1.5 rounded-xl bg-[#F95721] text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm hover:opacity-90"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Mirror View</span>
                </Link>
                <button
                  type="button"
                  onClick={closeCallerDetail}
                  className="p-1.5 rounded-xl text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF] hover:bg-black/5 dark:hover:bg-white/5"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Quick Summary Pill Bar */}
            {detailData && (
              <div className="grid grid-cols-4 gap-2 p-4 bg-black/[0.02] dark:bg-white/[0.02] border-b border-[#ECE8E1] dark:border-[#2D2924] text-center text-xs">
                <div>
                  <span className="text-[10px] font-mono text-[#8A8680] block">Dials</span>
                  <strong className="text-sm font-bold text-[#111110] dark:text-[#F5F3EF]">
                    {detailData.summary.total_dials}
                  </strong>
                </div>
                <div>
                  <span className="text-[10px] font-mono text-[#8A8680] block">Connects</span>
                  <strong className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                    {detailData.summary.connects}
                  </strong>
                </div>
                <div>
                  <span className="text-[10px] font-mono text-[#8A8680] block">Talk Time</span>
                  <strong className="text-sm font-bold text-[#111110] dark:text-[#F5F3EF]">
                    {formatDuration(detailData.summary.talk_time_seconds)}
                  </strong>
                </div>
                <div>
                  <span className="text-[10px] font-mono text-[#8A8680] block">Queue Depth</span>
                  <strong className="text-sm font-bold text-[#F95721]">
                    {detailData.summary.active_queue_count}
                  </strong>
                </div>
              </div>
            )}

            {/* Drawer Tabs */}
            <div className="flex border-b border-[#ECE8E1] dark:border-[#2D2924] text-xs">
              <button
                type="button"
                onClick={() => setDetailTab("calls")}
                className={`flex-1 py-3 font-semibold text-center border-b-2 transition-all ${
                  detailTab === "calls"
                    ? "border-[#F95721] text-[#F95721]"
                    : "border-transparent text-[#6E6B66] dark:text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF]"
                }`}
              >
                Call Activity Ledger ({detailData?.calls?.length || 0})
              </button>
              <button
                type="button"
                onClick={() => setDetailTab("queue")}
                className={`flex-1 py-3 font-semibold text-center border-b-2 transition-all ${
                  detailTab === "queue"
                    ? "border-[#F95721] text-[#F95721]"
                    : "border-transparent text-[#6E6B66] dark:text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF]"
                }`}
              >
                Assigned Queue ({detailData?.active_leads?.length || 0})
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {detailLoading ? (
                <div className="py-16 text-center text-[#8A8680]">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#F95721] mb-2" />
                  <p className="text-xs">Loading activity ledger...</p>
                </div>
              ) : detailTab === "calls" ? (
                detailData?.calls?.length === 0 ? (
                  <div className="py-16 text-center text-[#8A8680] space-y-2">
                    <PhoneOff className="w-8 h-8 mx-auto opacity-40" />
                    <p className="text-xs">No calls logged yet for this period.</p>
                  </div>
                ) : (
                  detailData?.calls?.map((call) => (
                    <div
                      key={call.id}
                      className="p-3.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.02] border border-[#ECE8E1] dark:border-[#2D2924] space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="text-xs font-bold text-[#111110] dark:text-[#F5F3EF]">
                            {call.lead?.name || "Unknown Lead"}
                          </h4>
                          <p className="text-[11px] text-[#6E6B66] dark:text-[#8A8680] font-mono">
                            {formatPhoneDisplay(call.lead?.phone)} &bull; {call.lead?.niche || "Sales"}
                          </p>
                        </div>

                        <div className="text-right shrink-0">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase ${
                              call.outcome === "interested"
                                ? "bg-orange-500/10 text-orange-600 dark:text-orange-400"
                                : call.outcome === "callback"
                                ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                                : call.outcome === "gatekeeper"
                                ? "bg-purple-500/10 text-purple-600 dark:text-purple-400"
                                : call.outcome === "not_interested"
                                ? "bg-red-500/10 text-red-600 dark:text-red-400"
                                : "bg-black/5 dark:bg-white/5 text-[#8A8680]"
                            }`}
                          >
                            {call.outcome}
                          </span>
                          <span className="block text-[10px] font-mono text-[#8A8680] mt-0.5">
                            {formatDuration(call.duration_seconds)}
                          </span>
                        </div>
                      </div>

                      {call.notes && (
                        <p className="text-xs bg-white dark:bg-[#1C1A17] p-2 rounded-xl border border-[#ECE8E1] dark:border-[#2D2924] text-[#111110] dark:text-[#F5F3EF] italic">
                          &ldquo;{call.notes}&rdquo;
                        </p>
                      )}

                      <div className="text-[10px] font-mono text-[#8A8680] flex items-center justify-between pt-1">
                        <span>{new Date(call.called_at).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })} IST</span>
                        {call.callback_at && (
                          <span className="text-blue-500 font-semibold">
                            Callback: {new Date(call.callback_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )
              ) : (
                /* Assigned Queue Tab */
                detailData?.active_leads?.length === 0 ? (
                  <div className="py-16 text-center text-[#8A8680] space-y-2">
                    <Inbox className="w-8 h-8 mx-auto opacity-40" />
                    <p className="text-xs">No active leads assigned in this caller&apos;s queue.</p>
                  </div>
                ) : (
                  detailData?.active_leads?.map((lead) => (
                    <div
                      key={lead.id}
                      className="p-3.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.02] border border-[#ECE8E1] dark:border-[#2D2924] flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <h4 className="font-bold text-[#111110] dark:text-[#F5F3EF] truncate">
                          {lead.name}
                        </h4>
                        <p className="text-[11px] text-[#6E6B66] dark:text-[#8A8680] font-mono truncate">
                          {formatPhoneDisplay(lead.phone)} &bull; {lead.area || "Pune"}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="px-2 py-0.5 rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400 font-mono text-[10px] font-bold">
                          Score: {lead.score}
                        </span>
                        <span className="block text-[10px] font-mono text-[#8A8680] mt-0.5">
                          Attempts: {lead.attempts_count || 0}/5
                        </span>
                      </div>
                    </div>
                  ))
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* REBALANCE LEADS MODAL (Missing 8 — Shift leads between callers)           */}
      {/* ========================================================================= */}
      {rebalanceModalOpen && (
        <div className="fixed inset-0 z-[400] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className="w-full max-w-md rounded-3xl bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] shadow-2xl p-6 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between pb-3 border-b border-[#ECE8E1] dark:border-[#2D2924]">
              <div>
                <span className="text-[10px] font-mono tracking-widest uppercase text-[#F95721] font-semibold">
                  LEAD DISTRIBUTION
                </span>
                <h3 className="text-lg font-black text-[#111110] dark:text-[#F5F3EF] tracking-tight mt-0.5">
                  Rebalance Caller Decks
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setRebalanceModalOpen(false)}
                className="p-1 rounded-xl text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF] hover:bg-black/5 dark:hover:bg-white/5"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleExecuteRebalance} className="space-y-4 mt-4 text-xs">
              <p className="text-[#6E6B66] dark:text-[#8A8680]">
                Transfer uncalled leads from a caller with a heavy queue to another caller with available capacity.
              </p>

              {rebalanceError && (
                <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 font-medium">
                  {rebalanceError}
                </div>
              )}

              {rebalanceSuccess && (
                <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-medium">
                  {rebalanceSuccess}
                </div>
              )}

              {/* Source Caller */}
              <div>
                <label className="block text-[11px] font-mono uppercase text-[#8A8680] font-semibold mb-1">
                  From Source Caller
                </label>
                <select
                  value={rebalanceSource}
                  onChange={(e) => setRebalanceSource(e.target.value)}
                  className="w-full p-2.5 rounded-2xl bg-black/5 dark:bg-white/5 border border-[#ECE8E1] dark:border-[#2D2924] font-medium text-xs text-[#111110] dark:text-[#F5F3EF] outline-none"
                >
                  <option value="">Select source caller...</option>
                  {callers.filter((c) => c.role === "caller").map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name} ({c.active_leads_count} active leads)
                    </option>
                  ))}
                </select>
              </div>

              {/* Target Caller */}
              <div>
                <label className="block text-[11px] font-mono uppercase text-[#8A8680] font-semibold mb-1">
                  To Receiving Caller
                </label>
                <select
                  value={rebalanceTarget}
                  onChange={(e) => setRebalanceTarget(e.target.value)}
                  className="w-full p-2.5 rounded-2xl bg-black/5 dark:bg-white/5 border border-[#ECE8E1] dark:border-[#2D2924] font-medium text-xs text-[#111110] dark:text-[#F5F3EF] outline-none"
                >
                  <option value="">Select target caller...</option>
                  {callers.filter((c) => c.role === "caller").map((c) => (
                    <option key={c.id} value={c.id} disabled={c.id === rebalanceSource}>
                      {c.full_name} ({c.active_leads_count} active leads)
                    </option>
                  ))}
                </select>
              </div>

              {/* Lead Count & Presets */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-mono uppercase text-[#8A8680] font-semibold">
                    Number of Leads to Transfer
                  </label>
                  <div className="flex gap-1">
                    {[5, 10, 15, 25].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setRebalanceCount(preset)}
                        className={`px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold transition-all ${
                          rebalanceCount === preset
                            ? "bg-[#F95721] text-white"
                            : "bg-black/5 dark:bg-white/5 text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF]"
                        }`}
                      >
                        +{preset}
                      </button>
                    ))}
                  </div>
                </div>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={rebalanceCount}
                  onChange={(e) => setRebalanceCount(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-full p-2.5 rounded-2xl bg-black/5 dark:bg-white/5 border border-[#ECE8E1] dark:border-[#2D2924] font-bold text-sm text-[#111110] dark:text-[#F5F3EF] outline-none"
                />
              </div>

              {/* Form Buttons */}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRebalanceModalOpen(false)}
                  className="flex-1 py-2.5 rounded-2xl border border-[#ECE8E1] dark:border-[#2D2924] font-medium text-[#6E6B66] dark:text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={rebalancing || !rebalanceSource || !rebalanceTarget}
                  className="flex-1 py-2.5 rounded-2xl bg-[#F95721] hover:bg-[#e04816] text-white font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {rebalancing ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Transferring...</span>
                    </>
                  ) : (
                    <span>Execute Rebalance</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2-STEP CONFIRMED PASSWORD RESET MODAL (Bug 4 — Safe credential recovery)  */}
      {/* ========================================================================= */}
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

            <form onSubmit={handleExecutePasswordReset} className="space-y-4 mt-4">
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-800 dark:text-amber-300 space-y-1">
                <p className="font-semibold flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>Password Reset for {targetCaller.full_name}</span>
                </p>
                <p className="text-[11px] text-amber-700 dark:text-amber-400">
                  Target Account: <strong>{targetCaller.email}</strong>
                </p>
                <p className="text-[11px] text-[#6E6B66] dark:text-[#8A8680]">
                  This issues a one-time temporary password. The user will be required to choose a new password immediately upon logging in.
                </p>
              </div>

              {resetError && (
                <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs font-medium">
                  {resetError}
                </div>
              )}

              {resetSuccess && (
                <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-medium space-y-1">
                  <div className="flex items-center gap-1.5 font-bold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span>Credentials Updated</span>
                  </div>
                  <p className="text-[11px]">{resetSuccess}</p>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-mono uppercase text-[#8A8680] font-semibold mb-1">
                  Temporary Password
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={tempPassword}
                    onChange={(e) => setTempPassword(e.target.value)}
                    required
                    className="w-full pl-3 pr-10 py-2.5 bg-black/5 dark:bg-white/5 border border-[#ECE8E1] dark:border-[#2D2924] rounded-2xl font-mono text-xs text-[#111110] dark:text-[#F5F3EF] outline-none"
                  />
                  <button
                    type="button"
                    onClick={copyPasswordToClipboard}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[#8A8680] hover:text-[#F95721]"
                    title="Copy temporary password"
                  >
                    {copiedPassword ? (
                      <Check className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleCloseResetModal}
                  className="flex-1 py-2.5 rounded-2xl border border-[#ECE8E1] dark:border-[#2D2924] text-xs font-medium text-[#6E6B66] dark:text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF]"
                >
                  {resetSuccess ? "Close" : "Cancel"}
                </button>
                {!resetSuccess && (
                  <button
                    type="submit"
                    disabled={isResetting || !tempPassword.trim()}
                    className="flex-1 py-2.5 rounded-2xl bg-[#F95721] hover:bg-[#e04816] text-white text-xs font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    {isResetting ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Updating...</span>
                      </>
                    ) : (
                      <span>Confirm & Apply</span>
                    )}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ROLE CHANGE MODAL (Interactive Role Management)                           */}
      {/* ========================================================================= */}
      {roleModalCaller && (
        <div className="fixed inset-0 z-[400] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className="w-full max-w-lg rounded-3xl bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] shadow-2xl p-6 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-3 border-b border-[#ECE8E1] dark:border-[#2D2924]">
              <div>
                <span className="text-[10px] font-mono tracking-widest uppercase text-[#F95721] font-semibold">
                  PERMISSION MANAGEMENT
                </span>
                <h3 className="text-lg font-black text-[#111110] dark:text-[#F5F3EF] tracking-tight mt-0.5">
                  Change Role for {roleModalCaller.full_name}
                </h3>
              </div>
              <button
                type="button"
                onClick={handleCloseRoleModal}
                className="p-1 rounded-xl text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF] hover:bg-black/5 dark:hover:bg-white/5"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleExecuteRoleChange} className="space-y-4 mt-4">
              <div className="p-3.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.02] border border-[#ECE8E1] dark:border-[#2D2924] flex items-center justify-between text-xs">
                <div>
                  <span className="text-[#8A8680] block text-[10px] font-mono uppercase">Teammate Account</span>
                  <span className="font-bold text-[#111110] dark:text-[#F5F3EF]">{roleModalCaller.email}</span>
                </div>
                <div className="text-right">
                  <span className="text-[#8A8680] block text-[10px] font-mono uppercase">Current Role</span>
                  <span className="inline-flex items-center gap-1 font-mono font-bold text-xs uppercase text-[#F95721]">
                    {roleModalCaller.role}
                  </span>
                </div>
              </div>

              {roleUpdateError && (
                <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs font-medium">
                  {roleUpdateError}
                </div>
              )}

              {roleUpdateSuccess && (
                <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-medium space-y-1">
                  <div className="flex items-center gap-1.5 font-bold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span>Role Updated</span>
                  </div>
                  <p className="text-[11px]">{roleUpdateSuccess}</p>
                </div>
              )}

              {/* Role Selection Radio Cards */}
              <div className="space-y-2">
                <label className="block text-[11px] font-mono uppercase text-[#8A8680] font-semibold">
                  Select New Role
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* Caller */}
                  <label
                    className={`p-3 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between ${
                      selectedNewRole === "caller"
                        ? "bg-[#F95721]/10 border-[#F95721] ring-2 ring-[#F95721]/30"
                        : "bg-black/[0.02] dark:bg-white/[0.02] border-[#ECE8E1] dark:border-[#2D2924] hover:border-[#F95721]/50"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-base">📞</span>
                        <span className="font-bold text-xs text-[#111110] dark:text-[#F5F3EF]">Caller</span>
                      </div>
                      <input
                        type="radio"
                        name="newRole"
                        value="caller"
                        checked={selectedNewRole === "caller"}
                        onChange={() => setSelectedNewRole("caller")}
                        className="accent-[#F95721]"
                      />
                    </div>
                    <p className="text-[10px] text-[#6E6B66] dark:text-[#8A8680] leading-snug">
                      Outbound dial queue access, receives distributed leads, logs call outcomes.
                    </p>
                  </label>

                  {/* Manager */}
                  <label
                    className={`p-3 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between ${
                      selectedNewRole === "manager"
                        ? "bg-purple-500/10 border-purple-500 ring-2 ring-purple-500/30"
                        : "bg-black/[0.02] dark:bg-white/[0.02] border-[#ECE8E1] dark:border-[#2D2924] hover:border-purple-500/50"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-base">🛡️</span>
                        <span className="font-bold text-xs text-[#111110] dark:text-[#F5F3EF]">Manager</span>
                      </div>
                      <input
                        type="radio"
                        name="newRole"
                        value="manager"
                        checked={selectedNewRole === "manager"}
                        onChange={() => setSelectedNewRole("manager")}
                        className="accent-purple-600"
                      />
                    </div>
                    <p className="text-[10px] text-[#6E6B66] dark:text-[#8A8680] leading-snug">
                      Team Command Center, Mirror Mode, Lead Rebalancer, Quarantine Holding Bin.
                    </p>
                  </label>

                  {/* Developer */}
                  <label
                    className={`p-3 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between ${
                      selectedNewRole === "developer"
                        ? "bg-cyan-500/10 border-cyan-500 ring-2 ring-cyan-500/30"
                        : "bg-black/[0.02] dark:bg-white/[0.02] border-[#ECE8E1] dark:border-[#2D2924] hover:border-cyan-500/50"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-base">💻</span>
                        <span className="font-bold text-xs text-[#111110] dark:text-[#F5F3EF]">Developer</span>
                      </div>
                      <input
                        type="radio"
                        name="newRole"
                        value="developer"
                        checked={selectedNewRole === "developer"}
                        onChange={() => setSelectedNewRole("developer")}
                        className="accent-cyan-600"
                      />
                    </div>
                    <p className="text-[10px] text-[#6E6B66] dark:text-[#8A8680] leading-snug">
                      Agency Projects, sprint development kanban boards, and Developer Studio.
                    </p>
                  </label>

                  {/* Admin */}
                  <label
                    className={`p-3 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between ${
                      selectedNewRole === "admin"
                        ? "bg-amber-500/10 border-amber-500 ring-2 ring-amber-500/30"
                        : "bg-black/[0.02] dark:bg-white/[0.02] border-[#ECE8E1] dark:border-[#2D2924] hover:border-amber-500/50"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-base">👑</span>
                        <span className="font-bold text-xs text-[#111110] dark:text-[#F5F3EF]">Admin</span>
                      </div>
                      <input
                        type="radio"
                        name="newRole"
                        value="admin"
                        checked={selectedNewRole === "admin"}
                        onChange={() => setSelectedNewRole("admin")}
                        className="accent-amber-600"
                      />
                    </div>
                    <p className="text-[10px] text-[#6E6B66] dark:text-[#8A8680] leading-snug">
                      Full administrative authority across all modules, settings, and team rosters.
                    </p>
                  </label>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleCloseRoleModal}
                  className="flex-1 py-2.5 rounded-2xl border border-[#ECE8E1] dark:border-[#2D2924] text-xs font-medium text-[#6E6B66] dark:text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF]"
                >
                  {roleUpdateSuccess ? "Done" : "Cancel"}
                </button>
                {!roleUpdateSuccess && (
                  <button
                    type="submit"
                    disabled={isUpdatingRole || selectedNewRole === roleModalCaller.role}
                    className="flex-1 py-2.5 rounded-2xl bg-[#F95721] hover:bg-[#e04816] text-white text-xs font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    {isUpdatingRole ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Updating Role...</span>
                      </>
                    ) : (
                      <span>Apply Role Change</span>
                    )}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
