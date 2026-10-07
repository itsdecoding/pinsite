"use client";

import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
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
  Radio,
  Zap,
  PhoneForwarded,
  FileText,
  Calendar,
  Shield,
  PhoneOff,
  UserX,
  AlertTriangle,
  UserCog,
  Sparkles,
  ChevronDown,
  Eye,
  Code2,
  Kanban,
  ShieldCheck,
  MessageSquare,
} from "lucide-react";

interface OutcomeBreakdown {
  interested: number;
  callback: number;
  no_answer: number;
  gatekeeper: number;
  not_interested: number;
  dnc: number;
}

interface PipelineCounts {
  dial_now: number;
  callbacks: number;
  overdue_callbacks: number;
  waiting: number;
  done: number;
  total_assigned: number;
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
  pipeline: PipelineCounts;
  outcomes_breakdown: OutcomeBreakdown;
}

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
  fleet_pipeline?: FleetPipeline;
  needs_attention?: NeedsAttentionItem[];
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
    all_time_dials?: number;
    connects: number;
    connect_rate: number | null;
    talk_time_seconds: number;
    active_queue_count: number;
    range?: string;
    range_label?: string;
    pipeline?: PipelineCounts;
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

function formatCallbackDate(isoString: string | null | undefined): { label: string; isOverdue: boolean } {
  if (!isoString) return { label: "No time set", isOverdue: false };
  const d = new Date(isoString);
  const now = new Date();
  const isOverdue = d < now;
  const dateStr = d.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
  const timeStr = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
  return {
    label: `${dateStr}, ${timeStr}`,
    isOverdue,
  };
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
    fleet_pipeline: {
      dial_now: 0,
      callbacks: 0,
      overdue_callbacks: 0,
      waiting: 0,
      done_today: 0,
    },
    needs_attention: [],
  });
  const [quarantineCount, setQuarantineCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "online" | "offline">("all");
  const [roleFilter, setRoleFilter] = useState<"all" | "caller" | "manager" | "developer">("all");
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);
  const roleDropdownRef = useRef<HTMLDivElement>(null);
  const [sortBy, setSortBy] = useState<"urgency" | "dials" | "connects" | "queue" | "name">("urgency");
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
  const [detailTab, setDetailTab] = useState<"calls" | "callbacks" | "queue">("calls");

  // Reassign modal state
  const [reassignModalOpen, setReassignModalOpen] = useState(false);
  const [reassignMode, setReassignMode] = useState<"between" | "unassigned">("between");
  const [reassignSource, setReassignSource] = useState<string>("");
  const [reassignTarget, setReassignTarget] = useState<string>("");
  const [reassignCount, setReassignCount] = useState<number>(10);
  const [reassigning, setReassigning] = useState(false);
  const [reassignError, setReassignError] = useState<string | null>(null);
  const [reassignSuccess, setReassignSuccess] = useState<string | null>(null);

  // Role change modal state
  const [roleModalCaller, setRoleModalCaller] = useState<CallerStat | null>(null);
  const [selectedNewRole, setSelectedNewRole] = useState<string>("caller");
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);
  const [roleUpdateError, setRoleUpdateError] = useState<string | null>(null);
  const [roleUpdateSuccess, setRoleUpdateSuccess] = useState<string | null>(null);

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

  // Teammate count per role category
  const roleCounts = useMemo(() => {
    const all = callers.length;
    const callersCount = callers.filter((c) => c.role === "caller").length;
    const managersCount = callers.filter((c) => c.role === "manager" || c.role === "admin").length;
    const developersCount = callers.filter((c) => c.role === "developer").length;
    return {
      all,
      caller: callersCount,
      manager: managersCount,
      developer: developersCount,
    };
  }, [callers]);

  // Close role filter dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (roleDropdownRef.current && !roleDropdownRef.current.contains(event.target as Node)) {
        setRoleDropdownOpen(false);
      }
    }
    if (roleDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [roleDropdownOpen]);

  // Fetch Caller Activity Detail when drawer is opened
  const openCallerDetail = async (callerId: string, initialTab: "calls" | "callbacks" | "queue" = "calls") => {
    setDetailCallerId(callerId);
    setDetailLoading(true);
    setDetailTab(initialTab);
    try {
      const res = await fetch(`/api/manager/caller-activity?caller_id=${callerId}&range=${timeRange}`);
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

  // Filtered & Sorted callers list (Default sort: Urgency / Needs attention first)
  const filteredCallers = useMemo(() => {
    const list = callers.filter((c) => {
      const matchesSearch =
        c.full_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.email.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      if (statusFilter === "online") return c.is_online;
      if (statusFilter === "offline") return !c.is_online;

      if (roleFilter !== "all") {
        if (roleFilter === "manager") {
          if (c.role !== "manager" && c.role !== "admin") return false;
        } else if (c.role !== roleFilter) {
          return false;
        }
      }

      return true;
    });

    list.sort((a, b) => {
      if (sortBy === "urgency") {
        // Priority 1: Overdue callbacks (callers only)
        const aOverdue = a.role === "caller" ? (a.pipeline?.overdue_callbacks || 0) : 0;
        const bOverdue = b.role === "caller" ? (b.pipeline?.overdue_callbacks || 0) : 0;
        if (aOverdue !== bOverdue) return bOverdue - aOverdue;

        // Priority 2: Zero dials today (for active callers only)
        const aZero = a.role === "caller" && a.dials_today === 0 && a.active ? 1 : 0;
        const bZero = b.role === "caller" && b.dials_today === 0 && b.active ? 1 : 0;
        if (aZero !== bZero) return bZero - aZero;

        // Priority 3: Queue depth (callers only)
        const aQueue = a.role === "caller" ? a.active_leads_count : 0;
        const bQueue = b.role === "caller" ? b.active_leads_count : 0;
        if (aQueue !== bQueue) return bQueue - aQueue;

        return a.full_name.localeCompare(b.full_name);
      }
      if (sortBy === "dials") return b.dials_today - a.dials_today;
      if (sortBy === "connects") return b.connects_today - a.connects_today;
      if (sortBy === "queue") return b.active_leads_count - a.active_leads_count;
      if (sortBy === "name") return a.full_name.localeCompare(b.full_name);
      return 0;
    });

    return list;
  }, [callers, searchQuery, statusFilter, roleFilter, sortBy]);

  // Reassign Modal Opener
  function openReassignModal(sourceCallerId?: string, mode: "between" | "unassigned" = "between") {
    setReassignError(null);
    setReassignSuccess(null);
    setReassignMode(mode);

    const onlyCallers = callers.filter((c) => c.role === "caller");
    if (sourceCallerId) {
      setReassignSource(sourceCallerId);
      const other = onlyCallers.find((c) => c.id !== sourceCallerId);
      if (other) setReassignTarget(other.id);
    } else {
      const sorted = [...onlyCallers].sort((a, b) => b.active_leads_count - a.active_leads_count);
      if (sorted.length >= 2) {
        setReassignSource(sorted[0].id);
        setReassignTarget(sorted[sorted.length - 1].id);
      }
    }
    setReassignCount(10);
    setReassignModalOpen(true);
  }

  // Handle Reassign Execution (Supports both between callers and unassigned pool)
  async function handleExecuteReassign(e: React.FormEvent) {
    e.preventDefault();
    setReassigning(true);
    setReassignError(null);
    setReassignSuccess(null);

    try {
      if (reassignMode === "unassigned") {
        const res = await fetch("/api/manager/leads/distribute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target_cap: 30 }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to reassign unassigned leads");
        setReassignSuccess(data.message || `Reassigned ${data.assigned_count} leads successfully!`);
      } else {
        if (!reassignSource || !reassignTarget) {
          throw new Error("Please select both source and target callers");
        }
        if (reassignSource === reassignTarget) {
          throw new Error("Source and target callers cannot be the same");
        }
        if (reassignCount <= 0) {
          throw new Error("Lead count must be at least 1");
        }

        const res = await fetch("/api/manager/leads/rebalance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source_caller_id: reassignSource,
            target_caller_id: reassignTarget,
            count: reassignCount,
          }),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Failed to reassign leads");
        setReassignSuccess(`Successfully reassigned ${data.rebalanced_count} leads!`);
      }

      await fetchTeamStats(true);
      setTimeout(() => {
        setReassignModalOpen(false);
        setReassignSuccess(null);
      }, 1500);
    } catch (err: any) {
      setReassignError(err.message || "An unexpected error occurred during reassign");
    } finally {
      setReassigning(false);
    }
  }

  // Password reset handlers
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
        `Temporary password for ${targetCaller.full_name} set successfully. The caller will be prompted to choose a permanent password upon login.`
      );

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

  // Role change handlers
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
      if (!res.ok) throw new Error(data.error || "Failed to update role");

      const successMsg =
        data.message || `Updated ${roleModalCaller.full_name}'s role to ${selectedNewRole.toUpperCase()}.`;
      setRoleUpdateSuccess(successMsg);

      // Refresh team stats immediately to update fleet pipeline and roster counts
      await fetchTeamStats(true);

      setTimeout(() => handleCloseRoleModal(), 1600);
    } catch (err: any) {
      setRoleUpdateError(err.message || "An unexpected error occurred while updating role");
    } finally {
      setIsUpdatingRole(false);
    }
  }

  const activeCallersCount = callers.filter((c) => c.role === "caller").length;

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* ========================================================================= */}
      {/* 1. HEADER & SUB-NAVIGATION                                                */}
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
            Team Roster & Telemetry
          </h1>
          <p className="text-xs text-[#6E6B66] dark:text-[#8A8680] mt-1">
            Who&apos;s working, who&apos;s stuck, and where to intervene.
          </p>
        </div>

        {/* Sub-nav tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-black/5 dark:bg-white/5 rounded-2xl border border-[#ECE8E1] dark:border-[#262420] shrink-0 self-start md:self-auto overflow-x-auto max-w-full">
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
          <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-mono text-[11px]">
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            <span>Live telemetry</span>
          </div>
          <span className="text-[#8A8680]">&bull;</span>
          <span className="text-[#8A8680] font-mono text-[11px]">{formatTimeAgo(lastRefreshedAt)}</span>

          {/* Time Range Selector */}
          <div className="flex items-center p-0.5 bg-black/5 dark:bg-white/5 rounded-xl border border-[#ECE8E1] dark:border-[#262420] ml-2">
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
          {/* Unified Action Button: Reassign */}
          <button
            type="button"
            onClick={() => openReassignModal()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#F95721] hover:bg-[#E04612] text-white font-semibold text-xs transition-all shadow-sm active:scale-95"
          >
            <PhoneForwarded className="w-3.5 h-3.5" />
            <span>Reassign Leads</span>
          </button>

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
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#262420] hover:border-[#F95721] text-[#111110] dark:text-[#F5F3EF] shadow-sm transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-[#F95721]" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. FLEET PIPELINE — ONE HERO SECTION, 4 NUMBERS (Dial Now / Callbacks / Waiting / Done) */}
      {/* ========================================================================= */}
      <div className="p-5 sm:p-6 rounded-3xl bg-white dark:bg-[#181715] border border-[#ECE8E1] dark:border-[#262420] shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-[#ECE8E1]/80 dark:border-[#262420] gap-2">
          <div>
            <span className="text-[10px] font-mono tracking-widest uppercase text-[#F95721] font-bold">
              FLEET PIPELINE
            </span>
            <p className="text-xs text-[#6E6B66] dark:text-[#8A8680] mt-0.5">
              Workload distribution across callers
            </p>
          </div>
          <div className="text-xs text-[#6E6B66] dark:text-[#8A8680] font-mono">
            <span>{summary.active_callers} active callers &bull; {summary.total_connects_today} connects &bull; {formatDuration(summary.total_talk_time_seconds)} talk</span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 pt-5">
          {/* 1. Dial Now */}
          <div className="p-4 rounded-2xl bg-black/[0.02] dark:bg-white/[0.02] border border-[#ECE8E1]/60 dark:border-[#262420] flex flex-col justify-between">
            <span className="text-[11px] font-mono uppercase tracking-wider text-[#6E6B66] dark:text-[#8A8680] font-semibold">
              Dial Now
            </span>
            <div className="mt-2">
              <div className="text-3xl sm:text-4xl font-black text-[#111110] dark:text-[#F5F3EF] tracking-tight">
                {summary.fleet_pipeline?.dial_now ?? 0}
              </div>
              <p className="text-[11px] text-[#6E6B66] dark:text-[#8A8680] mt-0.5">
                Ready to call immediately
              </p>
            </div>
          </div>

          {/* 2. Callbacks */}
          <div className="p-4 rounded-2xl bg-black/[0.02] dark:bg-white/[0.02] border border-[#ECE8E1]/60 dark:border-[#262420] flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono uppercase tracking-wider text-[#6E6B66] dark:text-[#8A8680] font-semibold">
                Callbacks
              </span>
              {(summary.fleet_pipeline?.overdue_callbacks ?? 0) > 0 && (
                <span className="px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                  {summary.fleet_pipeline?.overdue_callbacks} overdue
                </span>
              )}
            </div>
            <div className="mt-2">
              <div className="text-3xl sm:text-4xl font-black text-[#111110] dark:text-[#F5F3EF] tracking-tight">
                {summary.fleet_pipeline?.callbacks ?? 0}
              </div>
              <p className="text-[11px] text-[#6E6B66] dark:text-[#8A8680] mt-0.5">
                Scheduled warm follow-ups
              </p>
            </div>
          </div>

          {/* 3. Waiting */}
          <div className="p-4 rounded-2xl bg-black/[0.02] dark:bg-white/[0.02] border border-[#ECE8E1]/60 dark:border-[#262420] flex flex-col justify-between">
            <span className="text-[11px] font-mono uppercase tracking-wider text-[#6E6B66] dark:text-[#8A8680] font-semibold">
              Waiting
            </span>
            <div className="mt-2">
              <div className="text-3xl sm:text-4xl font-black text-[#111110] dark:text-[#F5F3EF] tracking-tight">
                {summary.fleet_pipeline?.waiting ?? 0}
              </div>
              <p className="text-[11px] text-[#6E6B66] dark:text-[#8A8680] mt-0.5">
                In cadence cooldown
              </p>
            </div>
          </div>

          {/* 4. Done Today */}
          <div className="p-4 rounded-2xl bg-black/[0.02] dark:bg-white/[0.02] border border-[#ECE8E1]/60 dark:border-[#262420] flex flex-col justify-between">
            <span className="text-[11px] font-mono uppercase tracking-wider text-[#6E6B66] dark:text-[#8A8680] font-semibold">
              Done Today
            </span>
            <div className="mt-2">
              <div className="text-3xl sm:text-4xl font-black text-emerald-600 dark:text-emerald-400 tracking-tight">
                {summary.fleet_pipeline?.done_today ?? summary.total_dials_today}
              </div>
              <p className="text-[11px] text-[#6E6B66] dark:text-[#8A8680] mt-0.5">
                Outbound attempts logged
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. NEEDS ATTENTION STRIP (Quiet when fine, alert when action needed)       */}
      {/* ========================================================================= */}
      {summary.needs_attention && summary.needs_attention.length > 0 && (
        <div className="p-4 rounded-3xl bg-amber-500/10 border border-amber-500/30 text-xs shadow-sm space-y-2.5 animate-in fade-in">
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-bold tracking-wider font-mono text-[11px] uppercase">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>NEEDS ATTENTION ({summary.needs_attention.length})</span>
          </div>
          <div className="divide-y divide-amber-500/15">
            {summary.needs_attention.map((item) => (
              <div key={item.id} className="py-2 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                  <span className="text-[#111110] dark:text-[#F5F3EF] font-medium">{item.message}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (item.type === "imbalance") {
                      openReassignModal(item.caller_id);
                    } else if (item.caller_id) {
                      openCallerDetail(item.caller_id, item.type === "overdue_callbacks" ? "callbacks" : "calls");
                    }
                  }}
                  className="text-[11px] font-bold text-[#F95721] hover:underline shrink-0"
                >
                  {item.action_label}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. TEAM ROSTER CONTROLS (Role Filter Dropdown, Search, Sort, Status)      */}
      {/* ========================================================================= */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-2">
        {/* Role Filter Dropdown (Replaces static CALLERS header) */}
        <div className="relative inline-block text-left" ref={roleDropdownRef}>
          <button
            type="button"
            onClick={() => setRoleDropdownOpen((prev) => !prev)}
            className="flex items-center justify-between gap-2 px-3 py-1.5 w-48 bg-white dark:bg-[#181715] border border-[#ECE8E1] dark:border-[#262420] rounded-xl text-xs text-[#111110] dark:text-[#F5F3EF] font-medium shadow-sm hover:border-[#F95721]/50 transition-all cursor-pointer"
          >
            <span className="truncate">
              {roleFilter === "all" && `Filter: All (${roleCounts.all})`}
              {roleFilter === "manager" && `Filter: Managers (${roleCounts.manager})`}
              {roleFilter === "caller" && `Filter: Callers (${roleCounts.caller})`}
              {roleFilter === "developer" && `Filter: Developers (${roleCounts.developer})`}
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-[#8A8680] transition-transform duration-200 shrink-0 ${
                roleDropdownOpen ? "rotate-180 text-[#F95721]" : ""
              }`}
            />
          </button>

          {roleDropdownOpen && (
            <div className="absolute left-0 mt-1.5 w-48 rounded-xl bg-white dark:bg-[#181715] border border-[#ECE8E1] dark:border-[#262420] shadow-xl z-50 py-1 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              {[
                { key: "all", label: `All (${roleCounts.all})` },
                { key: "manager", label: `Managers (${roleCounts.manager})` },
                { key: "caller", label: `Callers (${roleCounts.caller})` },
                { key: "developer", label: `Developers (${roleCounts.developer})` },
              ].map((opt) => {
                const isActive = roleFilter === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => {
                      setRoleFilter(opt.key as any);
                      setRoleDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between transition-colors ${
                      isActive
                        ? "bg-[#F95721]/10 text-[#F95721] font-bold"
                        : "text-[#111110] dark:text-[#F5F3EF] hover:bg-black/5 dark:hover:bg-white/5"
                    }`}
                  >
                    <span>{opt.label}</span>
                    {isActive && <Check className="w-3.5 h-3.5 text-[#F95721]" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-1 max-w-xl md:justify-end">
          {/* Search Box */}
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#8A8680]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search callers..."
              className="w-full pl-9 pr-3 py-1.5 bg-white dark:bg-[#181715] border border-[#ECE8E1] dark:border-[#262420] focus:border-[#F95721] rounded-xl text-xs text-[#111110] dark:text-[#F5F3EF] outline-none shadow-sm transition-all"
            />
          </div>

          {/* Sort Dropdown — Default is Urgency / Needs Attention */}
          <select
            value={sortBy}
            onChange={(e: any) => setSortBy(e.target.value)}
            className="px-3 py-1.5 bg-white dark:bg-[#181715] border border-[#ECE8E1] dark:border-[#262420] rounded-xl text-xs text-[#111110] dark:text-[#F5F3EF] outline-none shadow-sm cursor-pointer font-medium"
          >
            <option value="urgency">Sort: Needs Attention First</option>
            <option value="dials">Sort: Most Dials</option>
            <option value="connects">Sort: Connects</option>
            <option value="queue">Sort: Queue Depth</option>
            <option value="name">Sort: Name (A-Z)</option>
          </select>

          {/* Status Filter */}
          <div className="flex items-center p-0.5 bg-white dark:bg-[#181715] rounded-xl border border-[#ECE8E1] dark:border-[#262420] shadow-sm text-xs">
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={`px-2 py-1 rounded-lg text-[11px] font-medium transition-all ${
                statusFilter === "all"
                  ? "bg-[#111110] dark:bg-[#F5F3EF] text-white dark:text-[#111110]"
                  : "text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF]"
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("online")}
              className={`px-2 py-1 rounded-lg text-[11px] font-medium transition-all flex items-center gap-1 ${
                statusFilter === "online"
                  ? "bg-emerald-600 text-white"
                  : "text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF]"
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>Online</span>
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("offline")}
              className={`px-2 py-1 rounded-lg text-[11px] font-medium transition-all ${
                statusFilter === "offline"
                  ? "bg-stone-700 text-white"
                  : "text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF]"
              }`}
            >
              Offline
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 5. CALLER CARDS GRID — QUIET HIERARCHY, 4-STATE BREAKDOWN, NO EMOJIS      */}
      {/* ========================================================================= */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="p-5 rounded-3xl bg-white dark:bg-[#181715] border border-[#ECE8E1] dark:border-[#262420] animate-pulse space-y-4"
            >
              <div className="h-10 bg-black/5 dark:bg-white/5 rounded-2xl w-3/4" />
              <div className="h-16 bg-black/5 dark:bg-white/5 rounded-2xl" />
              <div className="h-8 bg-black/5 dark:bg-white/5 rounded-xl" />
            </div>
          ))}
        </div>
      ) : filteredCallers.length === 0 ? (
        <div className="text-center py-16 px-4 bg-white dark:bg-[#181715] rounded-3xl border border-[#ECE8E1] dark:border-[#262420] space-y-3">
          <Users className="w-10 h-10 text-[#8A8680] mx-auto opacity-50" />
          <h3 className="text-sm font-bold text-[#111110] dark:text-[#F5F3EF]">
            No team members match current filters
          </h3>
          <p className="text-xs text-[#8A8680]">
            Try adjusting your search query, role filter, or status filter.
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

            const isCaller = caller.role === "caller";
            const isDeveloper = caller.role === "developer";
            const isManagerOrAdmin = caller.role === "manager" || caller.role === "admin";
            const hasOverdue = isCaller && (caller.pipeline?.overdue_callbacks || 0) > 0;
            const hasZeroDials = isCaller && caller.dials_today === 0 && caller.active;

            return (
              <div
                key={caller.id}
                onClick={() => {
                  if (isCaller) openCallerDetail(caller.id);
                }}
                className={`p-5 rounded-3xl bg-white dark:bg-[#181715] border transition-all flex flex-col justify-between group ${
                  isCaller ? "cursor-pointer hover:shadow-md" : "cursor-default"
                } ${
                  hasOverdue
                    ? "border-amber-500/40 hover:border-amber-500"
                    : isCaller
                    ? "border-[#ECE8E1] dark:border-[#262420] hover:border-[#F95721]/50"
                    : "border-[#ECE8E1] dark:border-[#262420]"
                }`}
              >
                <div>
                  {/* Card Header: Avatar, Name, Quiet Dot, Role */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-10 h-10 rounded-2xl border flex items-center justify-center font-bold text-xs shrink-0 ${
                          isDeveloper
                            ? "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20"
                            : isManagerOrAdmin
                            ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20"
                            : "bg-black/5 dark:bg-white/5 border-[#ECE8E1] dark:border-[#262420] text-[#F95721]"
                        }`}
                      >
                        {initials}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          {/* Small status dot (Quiet, no bulky green badge!) */}
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              caller.is_online ? "bg-emerald-500" : "bg-zinc-600"
                            }`}
                            title={caller.is_online ? "Online" : "Offline"}
                          />
                          <h3
                            className={`text-sm font-bold text-[#111110] dark:text-[#F5F3EF] truncate transition-colors ${
                              isCaller ? "group-hover:text-[#F95721]" : ""
                            }`}
                          >
                            {caller.full_name}
                          </h3>
                        </div>
                        <p className="text-[11px] text-[#8A8680] truncate mt-0.5">
                          {caller.email}
                        </p>
                      </div>
                    </div>

                    {/* Role badge */}
                    <div className="flex items-center gap-1 shrink-0">
                      {caller.require_password_change && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                          Temp
                        </span>
                      )}
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-mono uppercase border ${
                          isDeveloper
                            ? "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20 font-bold"
                            : isManagerOrAdmin
                            ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20 font-bold"
                            : "bg-black/5 dark:bg-white/5 border-[#ECE8E1] dark:border-[#262420] text-[#8A8680]"
                        }`}
                      >
                        {caller.role}
                      </span>
                    </div>
                  </div>

                  {/* Body: Distinct per role type */}
                  {isCaller ? (
                    <>
                      {/* 4-State Pipeline Breakdown (Dial Now / Callbacks / Waiting / Done) */}
                      <div className="grid grid-cols-4 gap-1 p-2 rounded-2xl bg-black/[0.02] dark:bg-white/[0.02] border border-[#ECE8E1]/80 dark:border-[#262420] text-center mt-3.5">
                        <div>
                          <span className="text-[9px] font-mono uppercase text-[#8A8680] block">Dial Now</span>
                          <strong className="text-xs font-bold text-[#111110] dark:text-[#F5F3EF]">
                            {caller.pipeline?.dial_now ?? 0}
                          </strong>
                        </div>

                        <div>
                          <span className="text-[9px] font-mono uppercase text-[#8A8680] block">Callbacks</span>
                          <strong className="text-xs font-bold text-[#111110] dark:text-[#F5F3EF]">
                            {caller.pipeline?.callbacks ?? 0}
                            {hasOverdue && (
                              <span className="ml-0.5 text-[9px] text-amber-500 font-bold">
                                ({caller.pipeline.overdue_callbacks} od)
                              </span>
                            )}
                          </strong>
                        </div>

                        <div>
                          <span className="text-[9px] font-mono uppercase text-[#8A8680] block">Waiting</span>
                          <strong className="text-xs font-bold text-[#111110] dark:text-[#F5F3EF]">
                            {caller.pipeline?.waiting ?? 0}
                          </strong>
                        </div>

                        <div>
                          <span className="text-[9px] font-mono uppercase text-[#8A8680] block">Done</span>
                          <strong className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                            {caller.dials_today}
                          </strong>
                        </div>
                      </div>

                      {/* Shift Output Row: Dials · Connects · Talk Time */}
                      <div className="mt-3 flex items-center justify-between text-xs text-[#8A8680] font-mono">
                        <span className="text-[#111110] dark:text-[#F5F3EF] font-semibold">
                          {caller.dials_today} dials &bull; {caller.connects_today} connects &bull; {formatDuration(caller.talk_time_seconds)} talk
                        </span>
                        {hasZeroDials && (
                          <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold">
                            0 dials today
                          </span>
                        )}
                      </div>

                      {/* Outcome Breakdown (Using Clean Lucide Icons — No Emojis!) */}
                      <div className="mt-2.5 flex items-center gap-2 flex-wrap text-xs text-[#8A8680] pt-2 border-t border-[#ECE8E1]/60 dark:border-[#262420]/60">
                        <span className="inline-flex items-center gap-1" title="Interested">
                          <Flame className="w-3.5 h-3.5 text-orange-500" />
                          <span className="font-mono text-[#111110] dark:text-[#F5F3EF] text-[11px]">{caller.outcomes_breakdown?.interested || 0}</span>
                        </span>
                        <span className="inline-flex items-center gap-1" title="Callbacks">
                          <Calendar className="w-3.5 h-3.5 text-blue-400" />
                          <span className="font-mono text-[#111110] dark:text-[#F5F3EF] text-[11px]">{caller.outcomes_breakdown?.callback || 0}</span>
                        </span>
                        <span className="inline-flex items-center gap-1" title="No Answer">
                          <PhoneOff className="w-3.5 h-3.5 text-zinc-400" />
                          <span className="font-mono text-[#111110] dark:text-[#F5F3EF] text-[11px]">{caller.outcomes_breakdown?.no_answer || 0}</span>
                        </span>
                        <span className="inline-flex items-center gap-1" title="Gatekeeper">
                          <Shield className="w-3.5 h-3.5 text-amber-400" />
                          <span className="font-mono text-[#111110] dark:text-[#F5F3EF] text-[11px]">{caller.outcomes_breakdown?.gatekeeper || 0}</span>
                        </span>
                        <span className="inline-flex items-center gap-1" title="Rejected / Bad Fit">
                          <UserX className="w-3.5 h-3.5 text-rose-400" />
                          <span className="font-mono text-[#111110] dark:text-[#F5F3EF] text-[11px]">{caller.outcomes_breakdown?.not_interested || 0}</span>
                        </span>
                      </div>
                    </>
                  ) : isDeveloper ? (
                    /* Developer Card Overview (No cold-calling telemetry!) */
                    <div className="mt-3.5 p-3.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.02] border border-[#ECE8E1]/80 dark:border-[#262420] space-y-2.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[10px] font-mono uppercase text-[#8A8680] flex items-center gap-1.5 font-semibold">
                          <Code2 className="w-3.5 h-3.5 text-cyan-500" />
                          <span>Engineering Studio</span>
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 font-medium">
                          Full Stack Dev
                        </span>
                      </div>
                      <p className="text-[11px] text-[#8A8680] leading-snug">
                        Dedicated to application code, sprint deliverables, and platform infrastructure.
                      </p>
                      <div className="pt-2 border-t border-[#ECE8E1]/60 dark:border-[#262420]/60 flex items-center justify-between text-[11px] font-mono">
                        <span className="text-[#8A8680]">Studio Status:</span>
                        <span className={caller.is_online ? "text-emerald-500 font-semibold" : "text-zinc-500"}>
                          {caller.is_online ? "Active / In Studio" : "Offline"}
                        </span>
                      </div>
                    </div>
                  ) : (
                    /* Manager / Admin Card Overview (No cold-calling telemetry!) */
                    <div className="mt-3.5 p-3.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.02] border border-[#ECE8E1]/80 dark:border-[#262420] space-y-2.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[10px] font-mono uppercase text-[#8A8680] flex items-center gap-1.5 font-semibold">
                          <ShieldCheck className="w-3.5 h-3.5 text-purple-500" />
                          <span>Team Leadership</span>
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400 font-medium uppercase">
                          {caller.role}
                        </span>
                      </div>
                      <p className="text-[11px] text-[#8A8680] leading-snug">
                        Full oversight of cold calling pipeline, lead distribution, and team operations.
                      </p>
                      <div className="pt-2 border-t border-[#ECE8E1]/60 dark:border-[#262420]/60 flex items-center justify-between text-[11px] font-mono">
                        <span className="text-[#8A8680]">Workspace Status:</span>
                        <span className={caller.is_online ? "text-emerald-500 font-semibold" : "text-zinc-500"}>
                          {caller.is_online ? "Active / Supervising" : "Offline"}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Card Action Buttons */}
                <div className="mt-4 pt-3 border-t border-[#ECE8E1] dark:border-[#262420]" onClick={(e) => e.stopPropagation()}>
                  {isCaller ? (
                    /* Caller Actions: [Mirror] [Activity] [Reassign] */
                    <div className="grid grid-cols-3 gap-2">
                      <Link
                        href={`/queue?impersonate=${caller.id}`}
                        className="flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-[#F95721] hover:text-white text-[#111110] dark:text-[#F5F3EF] text-xs font-semibold transition-all"
                        title={`Mirror view of ${caller.full_name}'s cockpit`}
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span>Mirror</span>
                      </Link>

                      <button
                        type="button"
                        onClick={() => openCallerDetail(caller.id)}
                        className="flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-[#111110] dark:text-[#F5F3EF] text-xs font-semibold transition-all"
                      >
                        <FileText className="w-3 h-3 text-[#F95721]" />
                        <span>Activity</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => openReassignModal(caller.id)}
                        className="flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-[#111110] dark:text-[#F5F3EF] text-xs font-semibold transition-all"
                      >
                        <PhoneForwarded className="w-3 h-3 text-[#8A8680]" />
                        <span>Reassign</span>
                      </button>
                    </div>
                  ) : isDeveloper ? (
                    /* Developer Actions: [View Projects] [Message] */
                    <div className="grid grid-cols-2 gap-2">
                      <Link
                        href="/projects"
                        className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 text-xs font-semibold transition-all border border-cyan-500/20"
                      >
                        <Kanban className="w-3.5 h-3.5" />
                        <span>View Projects</span>
                      </Link>

                      <Link
                        href="/comms"
                        className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-[#111110] dark:text-[#F5F3EF] text-xs font-semibold transition-all border border-[#ECE8E1] dark:border-[#262420]"
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-[#8A8680]" />
                        <span>Message</span>
                      </Link>
                    </div>
                  ) : (
                    /* Manager / Admin Actions: [Team Invites] [Message] */
                    <div className="grid grid-cols-2 gap-2">
                      <Link
                        href="/manager/invites"
                        className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 text-xs font-semibold transition-all border border-purple-500/20"
                      >
                        <Users className="w-3.5 h-3.5" />
                        <span>Team Invites</span>
                      </Link>

                      <Link
                        href="/comms"
                        className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-[#111110] dark:text-[#F5F3EF] text-xs font-semibold transition-all border border-[#ECE8E1] dark:border-[#262420]"
                      >
                        <MessageSquare className="w-3.5 h-3.5 text-[#8A8680]" />
                        <span>Message</span>
                      </Link>
                    </div>
                  )}

                  {/* Secondary Links: Change Role & Reset Password */}
                  <div className="mt-2.5 flex items-center justify-between text-[10px] text-[#8A8680] px-1 font-mono">
                    <button
                      type="button"
                      onClick={(e) => handleOpenRoleModal(caller, e)}
                      className="hover:text-[#F95721] flex items-center gap-1 transition-colors"
                    >
                      <UserCog className="w-3 h-3" />
                      <span>Change Role</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleOpenResetModal(caller, e)}
                      className="hover:text-amber-500 flex items-center gap-1 transition-colors"
                    >
                      <KeyRound className="w-3 h-3" />
                      <span>Reset Password</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. CALLER ACTIVITY LEDGER DRAWER / SLIDE-OVER                              */}
      {/* ========================================================================= */}
      {detailCallerId && (
        <div className="fixed inset-0 z-[400] bg-black/50 backdrop-blur-sm flex justify-end">
          <div
            className="w-full max-w-xl h-full bg-white dark:bg-[#181715] border-l border-[#ECE8E1] dark:border-[#262420] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="p-5 border-b border-[#ECE8E1] dark:border-[#262420] flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-black/5 dark:bg-white/5 border border-[#ECE8E1] dark:border-[#262420] flex items-center justify-center font-bold text-sm text-[#F95721]">
                  {detailData?.caller.full_name?.slice(0, 2).toUpperCase() || "CL"}
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#111110] dark:text-[#F5F3EF]">
                    {detailData?.caller.full_name || "Caller Activity"}
                  </h3>
                  <p className="text-xs text-[#8A8680] mt-0.5">
                    {detailData?.caller.email} &bull; <span className="uppercase font-mono">{detailData?.caller.role}</span>
                  </p>
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

            {/* Metrics Bar — Matches the Card Exactly! */}
            {detailData && (
              <div className="grid grid-cols-4 gap-2 p-4 bg-black/[0.02] dark:bg-white/[0.02] border-b border-[#ECE8E1] dark:border-[#262420] text-center text-xs">
                <div>
                  <span className="text-[10px] font-mono text-[#8A8680] block">Dials ({detailData.summary.range_label || "Today"})</span>
                  <strong className="text-sm font-bold text-[#111110] dark:text-[#F5F3EF]">
                    {detailData.summary.total_dials}
                  </strong>
                  {detailData.summary.all_time_dials !== undefined && (
                    <span className="text-[10px] text-[#8A8680] block font-mono">
                      ({detailData.summary.all_time_dials} all-time)
                    </span>
                  )}
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

            {/* 3 Tabs: Calls, Callbacks (Fixing Bug 2!), Queue */}
            <div className="flex border-b border-[#ECE8E1] dark:border-[#262420] text-xs">
              <button
                type="button"
                onClick={() => setDetailTab("calls")}
                className={`flex-1 py-3 font-semibold text-center border-b-2 transition-all ${
                  detailTab === "calls"
                    ? "border-[#F95721] text-[#F95721]"
                    : "border-transparent text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF]"
                }`}
              >
                Calls ({detailData?.calls?.length || 0})
              </button>
              <button
                type="button"
                onClick={() => setDetailTab("callbacks")}
                className={`flex-1 py-3 font-semibold text-center border-b-2 transition-all ${
                  detailTab === "callbacks"
                    ? "border-[#F95721] text-[#F95721]"
                    : "border-transparent text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF]"
                }`}
              >
                Callbacks ({detailData?.summary.pipeline?.callbacks || 0})
              </button>
              <button
                type="button"
                onClick={() => setDetailTab("queue")}
                className={`flex-1 py-3 font-semibold text-center border-b-2 transition-all ${
                  detailTab === "queue"
                    ? "border-[#F95721] text-[#F95721]"
                    : "border-transparent text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF]"
                }`}
              >
                Queue ({detailData?.active_leads?.length || 0})
              </button>
            </div>

            {/* Drawer Body Content */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
              {detailLoading ? (
                <div className="py-16 text-center text-[#8A8680]">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#F95721] mb-2" />
                  <p className="text-xs">Loading activity ledger...</p>
                </div>
              ) : detailTab === "calls" ? (
                detailData?.calls?.length === 0 ? (
                  <div className="py-16 text-center text-[#8A8680] space-y-2">
                    <PhoneOff className="w-8 h-8 mx-auto opacity-40" />
                    <p className="text-xs">No calls logged yet in this time range.</p>
                  </div>
                ) : (
                  detailData?.calls?.map((call) => (
                    <div
                      key={call.id}
                      className="p-3.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.02] border border-[#ECE8E1] dark:border-[#262420] space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="text-xs font-bold text-[#111110] dark:text-[#F5F3EF]">
                            {call.lead?.name || "Unknown Lead"}
                          </h4>
                          <p className="text-[11px] text-[#8A8680] font-mono mt-0.5">
                            {formatPhoneDisplay(call.lead?.phone)} &bull; {call.lead?.niche || "Dental"} &bull; {call.lead?.area || "Mumbai"}
                          </p>
                        </div>

                        <div className="text-right shrink-0">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase ${
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
                        <p className="text-xs bg-white dark:bg-[#181715] p-2.5 rounded-xl border border-[#ECE8E1] dark:border-[#262420] text-[#111110] dark:text-[#F5F3EF] italic">
                          &ldquo;{call.notes}&rdquo;
                        </p>
                      )}
                    </div>
                  ))
                )
              ) : detailTab === "callbacks" ? (
                // Dedicated Callbacks Tab (Fixing Bug 2!)
                (() => {
                  const callbacksList = (detailData?.active_leads || []).filter(
                    (l) => l.status === "callback" || Boolean(l.next_callback_at)
                  );

                  if (callbacksList.length === 0) {
                    return (
                      <div className="py-16 text-center text-[#8A8680] space-y-2">
                        <Calendar className="w-8 h-8 mx-auto opacity-40 text-blue-400" />
                        <p className="text-xs">No pending callbacks scheduled for this caller.</p>
                      </div>
                    );
                  }

                  return callbacksList.map((lead) => {
                    const cbInfo = formatCallbackDate(lead.next_callback_at);
                    return (
                      <div
                        key={lead.id}
                        className={`p-3.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.02] border space-y-2 ${
                          cbInfo.isOverdue
                            ? "border-amber-500/50 bg-amber-500/[0.02]"
                            : "border-[#ECE8E1] dark:border-[#262420]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="text-xs font-bold text-[#111110] dark:text-[#F5F3EF]">
                                {lead.name}
                              </h4>
                              {cbInfo.isOverdue && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-amber-500/20 text-amber-700 dark:text-amber-300">
                                  OVERDUE
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-[#8A8680] font-mono mt-0.5">
                              {formatPhoneDisplay(lead.phone)} &bull; {lead.area}
                            </p>
                          </div>

                          <div className="text-right shrink-0">
                            <span className={`text-[11px] font-mono font-bold block ${
                              cbInfo.isOverdue ? "text-amber-600 dark:text-amber-400" : "text-blue-500"
                            }`}>
                              {cbInfo.label}
                            </span>
                            <span className="text-[10px] text-[#8A8680] block font-mono">
                              Attempt #{lead.attempts_count || 1}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  });
                })()
              ) : (
                // Queue Tab
                detailData?.active_leads?.length === 0 ? (
                  <div className="py-16 text-center text-[#8A8680]">
                    <p className="text-xs">Queue is empty. No leads currently assigned.</p>
                  </div>
                ) : (
                  detailData?.active_leads?.map((lead) => (
                    <div
                      key={lead.id}
                      className="p-3.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.02] border border-[#ECE8E1] dark:border-[#262420] flex items-center justify-between text-xs"
                    >
                      <div>
                        <h4 className="font-bold text-[#111110] dark:text-[#F5F3EF]">{lead.name}</h4>
                        <p className="text-[11px] text-[#8A8680] font-mono mt-0.5">
                          {formatPhoneDisplay(lead.phone)} &bull; {lead.niche} &bull; {lead.area}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="px-2 py-0.5 rounded-md font-mono text-[10px] uppercase bg-black/5 dark:bg-white/5 border border-[#ECE8E1] dark:border-[#262420] text-[#8A8680]">
                          {lead.status}
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
      {/* 7. REASSIGN LEADS MODAL (Unified Terminology: Reassign)                   */}
      {/* ========================================================================= */}
      {reassignModalOpen && (
        <div className="fixed inset-0 z-[400] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className="w-full max-w-lg rounded-3xl bg-white dark:bg-[#181715] border border-[#ECE8E1] dark:border-[#262420] shadow-2xl p-6 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between pb-3 border-b border-[#ECE8E1] dark:border-[#262420]">
              <div>
                <span className="text-[10px] font-mono tracking-widest uppercase text-[#F95721] font-semibold">
                  LEAD OPERATIONS
                </span>
                <h3 className="text-lg font-black text-[#111110] dark:text-[#F5F3EF] tracking-tight mt-0.5">
                  Reassign Leads
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setReassignModalOpen(false)}
                className="p-1 rounded-xl text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF] hover:bg-black/5 dark:hover:bg-white/5"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mode Toggle */}
            <div className="flex p-1 bg-black/5 dark:bg-white/5 rounded-2xl border border-[#ECE8E1] dark:border-[#262420] mt-4 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setReassignMode("between")}
                className={`flex-1 py-1.5 rounded-xl transition-all ${
                  reassignMode === "between"
                    ? "bg-white dark:bg-[#1C1A17] text-[#111110] dark:text-[#F5F3EF] shadow-sm"
                    : "text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF]"
                }`}
              >
                Between Callers
              </button>
              <button
                type="button"
                onClick={() => setReassignMode("unassigned")}
                className={`flex-1 py-1.5 rounded-xl transition-all ${
                  reassignMode === "unassigned"
                    ? "bg-white dark:bg-[#1C1A17] text-[#111110] dark:text-[#F5F3EF] shadow-sm"
                    : "text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF]"
                }`}
              >
                From Unassigned Pool
              </button>
            </div>

            <form onSubmit={handleExecuteReassign} className="space-y-4 mt-4 text-xs">
              {reassignError && (
                <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 font-medium">
                  {reassignError}
                </div>
              )}

              {reassignSuccess && (
                <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-medium">
                  {reassignSuccess}
                </div>
              )}

              {reassignMode === "between" ? (
                <>
                  <div>
                    <label className="block text-[11px] font-mono uppercase text-[#8A8680] font-semibold mb-1">
                      From Source Caller
                    </label>
                    <select
                      value={reassignSource}
                      onChange={(e) => setReassignSource(e.target.value)}
                      className="w-full p-2.5 rounded-2xl bg-black/5 dark:bg-white/5 border border-[#ECE8E1] dark:border-[#262420] font-medium text-xs text-[#111110] dark:text-[#F5F3EF] outline-none"
                    >
                      <option value="">Select source caller...</option>
                      {callers.filter((c) => c.role === "caller").map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.full_name} ({c.active_leads_count} active leads)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-mono uppercase text-[#8A8680] font-semibold mb-1">
                      To Receiving Caller
                    </label>
                    <select
                      value={reassignTarget}
                      onChange={(e) => setReassignTarget(e.target.value)}
                      className="w-full p-2.5 rounded-2xl bg-black/5 dark:bg-white/5 border border-[#ECE8E1] dark:border-[#262420] font-medium text-xs text-[#111110] dark:text-[#F5F3EF] outline-none"
                    >
                      <option value="">Select target caller...</option>
                      {callers.filter((c) => c.role === "caller").map((c) => (
                        <option key={c.id} value={c.id} disabled={c.id === reassignSource}>
                          {c.full_name} ({c.active_leads_count} active leads)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-mono uppercase text-[#8A8680] font-semibold">
                        Number of Leads to Reassign
                      </label>
                      <div className="flex gap-1">
                        {[5, 10, 15, 20].map((preset) => (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => setReassignCount(preset)}
                            className={`px-2 py-0.5 rounded-lg text-[10px] font-mono font-bold transition-all ${
                              reassignCount === preset
                                ? "bg-[#F95721] text-white"
                                : "bg-black/5 dark:bg-white/5 text-[#8A8680]"
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
                      value={reassignCount}
                      onChange={(e) => setReassignCount(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-full p-2.5 rounded-2xl bg-black/5 dark:bg-white/5 border border-[#ECE8E1] dark:border-[#262420] font-bold text-sm text-[#111110] dark:text-[#F5F3EF] outline-none"
                    />
                  </div>
                </>
              ) : (
                <div className="p-3.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.02] border border-[#ECE8E1] dark:border-[#262420] space-y-2">
                  <p className="text-xs text-[#111110] dark:text-[#F5F3EF] font-medium">
                    Automatically distribute available unassigned leads across active callers with capacity (capped at 30 leads per caller).
                  </p>
                  <p className="text-[11px] text-[#8A8680]">
                    Only callers who are currently active will receive leads.
                  </p>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReassignModalOpen(false)}
                  className="flex-1 py-2.5 rounded-2xl border border-[#ECE8E1] dark:border-[#262420] font-medium text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={reassigning || (reassignMode === "between" && (!reassignSource || !reassignTarget))}
                  className="flex-1 py-2.5 rounded-2xl bg-[#F95721] hover:bg-[#e04816] text-white font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {reassigning ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Reassigning...</span>
                    </>
                  ) : (
                    <span>Execute Reassign</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 8. PASSWORD RESET MODAL                                                   */}
      {/* ========================================================================= */}
      {targetCaller && (
        <div className="fixed inset-0 z-[400] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className="w-full max-w-md rounded-3xl bg-white dark:bg-[#181715] border border-[#ECE8E1] dark:border-[#262420] shadow-2xl p-6 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between pb-3 border-b border-[#ECE8E1] dark:border-[#262420]">
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
                <p className="text-[11px] text-[#8A8680]">
                  Target Account: <strong>{targetCaller.email}</strong>
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
                    className="w-full pl-3 pr-10 py-2.5 bg-black/5 dark:bg-white/5 border border-[#ECE8E1] dark:border-[#262420] rounded-2xl font-mono text-xs text-[#111110] dark:text-[#F5F3EF] outline-none"
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
                  className="flex-1 py-2.5 rounded-2xl border border-[#ECE8E1] dark:border-[#262420] text-xs font-medium text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF]"
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
      {/* 9. ROLE CHANGE MODAL                                                      */}
      {/* ========================================================================= */}
      {roleModalCaller && (
        <div className="fixed inset-0 z-[400] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className="w-full max-w-lg rounded-3xl bg-white dark:bg-[#181715] border border-[#ECE8E1] dark:border-[#262420] shadow-2xl p-6 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between pb-3 border-b border-[#ECE8E1] dark:border-[#262420]">
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
              <div className="p-3.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.02] border border-[#ECE8E1] dark:border-[#262420] flex items-center justify-between text-xs">
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

              {/* Automatic lead pool unassignment warning when converting caller -> non-caller */}
              {roleModalCaller.role === "caller" && selectedNewRole !== "caller" && (
                <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-800 dark:text-amber-300 space-y-1.5 animate-in fade-in">
                  <div className="flex items-center gap-1.5 font-bold">
                    <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span>Automatic Lead Pool Reassignment</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-amber-900/90 dark:text-amber-200/90">
                    Converting <strong>{roleModalCaller.full_name}</strong> from a <strong>Caller</strong> to a <strong>{selectedNewRole}</strong> will automatically return their{" "}
                    <strong>{roleModalCaller.active_leads_count} assigned lead{roleModalCaller.active_leads_count === 1 ? "" : "s"}</strong> back to the unassigned pool so they remain actionable.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <label className="block text-[11px] font-mono uppercase text-[#8A8680] font-semibold">
                  Select New Role
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <label
                    className={`p-3 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between ${
                      selectedNewRole === "caller"
                        ? "bg-[#F95721]/10 border-[#F95721] ring-2 ring-[#F95721]/30"
                        : "bg-black/[0.02] dark:bg-white/[0.02] border-[#ECE8E1] dark:border-[#262420]"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs text-[#111110] dark:text-[#F5F3EF]">Caller</span>
                      <input
                        type="radio"
                        name="newRole"
                        value="caller"
                        checked={selectedNewRole === "caller"}
                        onChange={() => setSelectedNewRole("caller")}
                        className="accent-[#F95721]"
                      />
                    </div>
                    <p className="text-[10px] text-[#8A8680]">
                      Outbound dial queue access, logs outcomes.
                    </p>
                  </label>

                  <label
                    className={`p-3 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between ${
                      selectedNewRole === "manager"
                        ? "bg-purple-500/10 border-purple-500 ring-2 ring-purple-500/30"
                        : "bg-black/[0.02] dark:bg-white/[0.02] border-[#ECE8E1] dark:border-[#262420]"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs text-[#111110] dark:text-[#F5F3EF]">Manager</span>
                      <input
                        type="radio"
                        name="newRole"
                        value="manager"
                        checked={selectedNewRole === "manager"}
                        onChange={() => setSelectedNewRole("manager")}
                        className="accent-purple-600"
                      />
                    </div>
                    <p className="text-[10px] text-[#8A8680]">
                      Team Command Center, Mirror Mode, Reassign leads.
                    </p>
                  </label>

                  <label
                    className={`p-3 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between ${
                      selectedNewRole === "developer"
                        ? "bg-cyan-500/10 border-cyan-500 ring-2 ring-cyan-500/30"
                        : "bg-black/[0.02] dark:bg-white/[0.02] border-[#ECE8E1] dark:border-[#262420]"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs text-[#111110] dark:text-[#F5F3EF]">Developer</span>
                      <input
                        type="radio"
                        name="newRole"
                        value="developer"
                        checked={selectedNewRole === "developer"}
                        onChange={() => setSelectedNewRole("developer")}
                        className="accent-cyan-600"
                      />
                    </div>
                    <p className="text-[10px] text-[#8A8680]">
                      Projects, sprint kanban, developer studio.
                    </p>
                  </label>

                  <label
                    className={`p-3 rounded-2xl border cursor-pointer transition-all flex flex-col justify-between ${
                      selectedNewRole === "admin"
                        ? "bg-amber-500/10 border-amber-500 ring-2 ring-amber-500/30"
                        : "bg-black/[0.02] dark:bg-white/[0.02] border-[#ECE8E1] dark:border-[#262420]"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs text-[#111110] dark:text-[#F5F3EF]">Admin</span>
                      <input
                        type="radio"
                        name="newRole"
                        value="admin"
                        checked={selectedNewRole === "admin"}
                        onChange={() => setSelectedNewRole("admin")}
                        className="accent-amber-600"
                      />
                    </div>
                    <p className="text-[10px] text-[#8A8680]">
                      Full administrative authority across all modules.
                    </p>
                  </label>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleCloseRoleModal}
                  className="flex-1 py-2.5 rounded-2xl border border-[#ECE8E1] dark:border-[#262420] text-xs font-medium text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF]"
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
                      <span>
                        {roleModalCaller.role === "caller" &&
                        selectedNewRole !== "caller" &&
                        roleModalCaller.active_leads_count > 0
                          ? `Apply & Return ${roleModalCaller.active_leads_count} Leads`
                          : "Apply Role Change"}
                      </span>
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
