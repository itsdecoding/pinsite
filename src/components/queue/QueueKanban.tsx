"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Sparkles,
  Flame,
  Phone,
  PhoneCall,
  Clock,
  MapPin,
  Globe,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  MoreHorizontal,
  RefreshCw,
  Loader2,
  Copy,
  Check,
  User,
  Users,
  AlertTriangle,
  Layers,
  ArrowRight,
  SlidersHorizontal,
  Search,
  X,
  ShieldCheck,
  CheckCircle2,
  ArrowUpDown,
} from "lucide-react";

export interface KanbanLead {
  id: string;
  name: string;
  phone: string;
  normalized_phone?: string;
  website: string | null;
  has_website?: boolean;
  address: string | null;
  niche: string;
  area: string;
  score: number;
  status: string;
  attempts_count?: number;
  next_callback_at?: string | null;
  last_called_at?: string | null;
  cooldown_until?: string | null;
  assigned_to?: string | null;
  created_at?: string;
  updated_at?: string;
  profiles?: {
    full_name: string;
  } | null;
}

export interface CallerColumnData {
  id: string;
  fullName: string;
  isOnline: boolean;
  activeCount: number;
  dialsToday: number;
  targetCap: number;
  fillPercentage: number;
  leads: KanbanLead[];
}

export interface KanbanData {
  userRole: string;
  currentUserId: string;
  summary: {
    unassignedPoolCount: number;
    interestedProspectsCount: number;
    totalAssignedCount: number;
    totalCallersCount: number;
    targetCap: number;
  };
  unassignedPool: {
    totalCount: number;
    leads: KanbanLead[];
  };
  interestedProspects: {
    totalCount: number;
    leads: KanbanLead[];
  };
  callerColumns: CallerColumnData[];
}

interface QueueKanbanProps {
  onSelectLeadForDial?: (lead: KanbanLead) => void;
  userRole?: string;
}

/**
 * Formats a phone number for clean human readability: +91 92264 14192
 */
function formatPhoneDisplay(phone: string | null | undefined): string {
  if (!phone) return "No Phone";
  const cleaned = phone.trim();
  const digits = cleaned.replace(/\D/g, "");

  let core10 = digits;
  if (digits.length === 11 && digits.startsWith("0")) {
    core10 = digits.slice(1);
  } else if (digits.length === 12 && digits.startsWith("91")) {
    core10 = digits.slice(2);
  }

  if (core10.length === 10) {
    return `+91 ${core10.slice(0, 5)} ${core10.slice(5)}`;
  }

  return phone;
}

function formatLeadName(rawName: string | null | undefined): string {
  if (!rawName) return "Unnamed Lead";
  let name = rawName.trim();
  name = name.replace(/([a-zA-Z0-9'’])\s*-\s*([a-zA-Z0-9])/g, "$1 - $2");
  name = name.replace(/\bDr\.([A-Za-z])/gi, "Dr. $1");
  name = name.replace(/\bDr(?!\.)\s+/gi, "Dr. ");
  name = name.replace(/\s+/g, " ").trim();
  return name;
}

function formatRelativeTime(dateString: string | null | undefined): string {
  if (!dateString) return "";
  const date = new Date(dateString);
  const now = new Date();
  const diffSec = Math.round((now.getTime() - date.getTime()) / 1000);

  if (diffSec < 60) return "Just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 172800) return "Yesterday";
  return date.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
}

export function QueueKanban({ onSelectLeadForDial, userRole = "caller" }: QueueKanbanProps) {
  const [data, setData] = useState<KanbanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedNiche, setSelectedNiche] = useState<string>("all");
  const [selectedCallerFilter, setSelectedCallerFilter] = useState<string>("all");
  const [targetCap, setTargetCap] = useState<number>(100);

  // Progressive Disclosure: Dropdown menus & dialog states
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);
  const [cardActionMenuId, setCardActionMenuId] = useState<string | null>(null);
  const [distributionModalOpen, setDistributionModalOpen] = useState(false);
  const [isDistributing, setIsDistributing] = useState(false);
  const [distributionResult, setDistributionResult] = useState<any | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Drag and Drop State
  const [draggedLead, setDraggedLead] = useState<KanbanLead | null>(null);
  const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null);

  const actionsMenuRef = useRef<HTMLDivElement>(null);
  const isManager = userRole === "admin" || userRole === "manager";

  // Close actions menu on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(event.target as Node)) {
        setIsActionsMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  }, []);

  // Fetch Kanban data
  const loadKanbanData = useCallback(
    async (isSilent = false) => {
      if (!isSilent) setLoading(true);
      else setRefreshing(true);

      try {
        const params = new URLSearchParams();
        if (selectedNiche && selectedNiche !== "all") params.set("niche", selectedNiche);
        if (selectedCallerFilter && selectedCallerFilter !== "all") params.set("caller_id", selectedCallerFilter);
        if (searchQuery.trim()) params.set("search", searchQuery.trim());
        params.set("target_cap", String(targetCap));

        const res = await fetch(`/api/queue/kanban?${params.toString()}`);
        if (!res.ok) throw new Error("Failed to fetch Kanban data");
        const json = await res.json();
        setData(json);
      } catch (err: any) {
        console.error("Failed to load queue kanban:", err);
        showToast("Error refreshing queue board");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [selectedNiche, selectedCallerFilter, searchQuery, targetCap, showToast]
  );

  useEffect(() => {
    loadKanbanData();
  }, [loadKanbanData]);

  // Execute Daily Distribution
  const handleExecuteDistribution = async () => {
    setIsDistributing(true);
    try {
      const res = await fetch("/api/manager/leads/distribute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target_cap: targetCap }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to distribute leads");

      setDistributionResult(result);
      showToast(`Assigned ${result.assigned_count} leads across callers (target: ${targetCap})`);
      await loadKanbanData(true);
    } catch (err: any) {
      alert(`Distribution failed: ${err.message}`);
    } finally {
      setIsDistributing(false);
    }
  };

  // Reassign or unassign lead
  const handleReassignLead = async (leadId: string, targetCallerId: string | null) => {
    try {
      const res = await fetch("/api/queue/reassign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: leadId,
          caller_id: targetCallerId,
          reason: targetCallerId ? "kanban_board_reassign" : "kanban_unassigned_to_pool",
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to move lead");

      showToast(targetCallerId ? "Lead moved to caller queue" : "Lead returned to unassigned pool");
      setCardActionMenuId(null);
      await loadKanbanData(true);
    } catch (err: any) {
      alert(`Move error: ${err.message}`);
    }
  };

  // Drag and Drop handlers
  const handleDragStart = (lead: KanbanLead) => {
    setDraggedLead(lead);
  };

  const handleDragOver = (e: React.DragEvent, colId: string) => {
    e.preventDefault();
    setDragOverColumnId(colId);
  };

  const handleDragLeave = () => {
    setDragOverColumnId(null);
  };

  const handleDrop = async (e: React.DragEvent, targetColumnId: string) => {
    e.preventDefault();
    setDragOverColumnId(null);

    if (!draggedLead) return;
    if (!isManager) {
      showToast("Only managers can drag and reassign leads");
      setDraggedLead(null);
      return;
    }

    if (targetColumnId === "unassigned_pool") {
      if (draggedLead.status === "unassigned" && !draggedLead.assigned_to) return;
      await handleReassignLead(draggedLead.id, null);
    } else if (targetColumnId.startsWith("caller_")) {
      const targetCallerId = targetColumnId.replace("caller_", "");
      if (draggedLead.assigned_to === targetCallerId) return;
      await handleReassignLead(draggedLead.id, targetCallerId);
    }

    setDraggedLead(null);
  };

  // Distinct niches extracted from current loaded leads for dropdown filter
  const availableNiches = React.useMemo(() => {
    if (!data) return [];
    const set = new Set<string>();
    data.unassignedPool.leads.forEach((l) => l.niche && set.add(l.niche));
    data.interestedProspects.leads.forEach((l) => l.niche && set.add(l.niche));
    data.callerColumns.forEach((c) => c.leads.forEach((l) => l.niche && set.add(l.niche)));
    return Array.from(set).sort();
  }, [data]);

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-3 text-[#6E6B66] dark:text-[#8A8680]">
        <Loader2 className="w-8 h-8 animate-spin text-[#F95721]" />
        <p className="text-xs font-mono uppercase tracking-wider">Syncing Transparent Lead Flow...</p>
      </div>
    );
  }

  // Caller Columns to show based on caller filter dropdown
  const filteredCallerColumns =
    selectedCallerFilter === "all"
      ? data?.callerColumns || []
      : (data?.callerColumns || []).filter((c) => c.id === selectedCallerFilter);

  return (
    <div className="space-y-4 w-full">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-[300] bg-[#111110] text-[#F5F3EF] dark:bg-white dark:text-[#111110] text-xs font-semibold px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2 border border-[#ECE8E1] dark:border-[#2D2924] animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle2 className="w-4 h-4 text-[#F95721]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Transparent Queue Header & Controls Bar */}
      <div className="bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] rounded-3xl p-4 sm:p-5 shadow-sm space-y-3.5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3.5">
          {/* Left: Section Title & Transparency Badges */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#F95721]" />
              <span className="text-xs font-mono uppercase tracking-wider font-black text-[#111110] dark:text-[#F5F3EF]">
                TRANSPARENT LEAD PIPELINE
              </span>
            </div>

            <span className="px-2.5 py-0.5 rounded-full bg-[#F95721]/10 text-[#F95721] font-mono text-[10px] font-bold border border-[#F95721]/20">
              Target: {targetCap} Leads / Caller
            </span>

            {/* Quick Aggregate Pills */}
            <div className="flex items-center gap-1.5 text-[11px] font-mono font-medium text-[#6E6B66] dark:text-[#8A8680]">
              <span>Pool: <strong className="text-[#111110] dark:text-[#F5F3EF]">{data?.summary.unassignedPoolCount ?? 0}</strong></span>
              <span>•</span>
              <span>Interested: <strong className="text-emerald-600 dark:text-emerald-400">{data?.summary.interestedProspectsCount ?? 0}</strong></span>
              <span>•</span>
              <span>In Queue: <strong className="text-[#F95721]">{data?.summary.totalAssignedCount ?? 0}</strong></span>
            </div>
          </div>

          {/* Right: Progressive Disclosure Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Search Input (Compact, progressive) */}
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search leads or phone..."
                className="text-xs py-1.5 pl-8 pr-3 rounded-full bg-black/5 dark:bg-white/5 border border-[#ECE8E1] dark:border-[#2D2924] text-[#111110] dark:text-[#F5F3EF] placeholder:text-[#8A8680] outline-none focus:border-[#F95721] w-40 sm:w-48 transition-all"
              />
              <Search className="w-3.5 h-3.5 text-[#8A8680] absolute left-2.5 top-1/2 -translate-y-1/2" />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8A8680] hover:text-[#111110]"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Rule: 5+ Options -> Dropdown (hidden until clicked) */}
            {/* Niche Dropdown Filter */}
            {availableNiches.length > 0 && (
              <div className="relative">
                <select
                  value={selectedNiche}
                  onChange={(e) => setSelectedNiche(e.target.value)}
                  className="text-xs font-semibold py-1.5 pl-3 pr-7 rounded-full bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] text-[#111110] dark:text-[#F5F3EF] hover:border-[#F95721] outline-none cursor-pointer appearance-none shadow-sm"
                  title="Filter by Niche"
                >
                  <option value="all">All Niches</option>
                  {availableNiches.map((niche) => (
                    <option key={niche} value={niche}>
                      {niche}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3 h-3 text-[#8A8680] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            )}

            {/* Rule: 5+ Options -> Dropdown (hidden until clicked) */}
            {/* Caller View Dropdown (When multiple callers exist) */}
            {(data?.callerColumns.length ?? 0) > 1 && (
              <div className="relative">
                <select
                  value={selectedCallerFilter}
                  onChange={(e) => setSelectedCallerFilter(e.target.value)}
                  className="text-xs font-semibold py-1.5 pl-3 pr-7 rounded-full bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] text-[#111110] dark:text-[#F5F3EF] hover:border-[#F95721] outline-none cursor-pointer appearance-none shadow-sm"
                  title="Filter by Caller"
                >
                  <option value="all">All Callers ({data?.callerColumns.length})</option>
                  {data?.callerColumns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.fullName} ({c.activeCount}/{c.targetCap})
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-3 h-3 text-[#8A8680] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            )}

            {/* Refresh Button */}
            <button
              type="button"
              onClick={() => loadKanbanData(true)}
              disabled={refreshing}
              className="p-2 rounded-full bg-black/5 dark:bg-white/5 hover:bg-black/10 text-[#111110] dark:text-[#F5F3EF] border border-[#ECE8E1] dark:border-[#2D2924] transition-colors"
              title="Refresh Kanban Board"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-[#F95721]" : ""}`} />
            </button>

            {/* Rule: Rarely-used action -> Behind a ⋯ menu */}
            {isManager && (
              <div className="relative" ref={actionsMenuRef}>
                <button
                  type="button"
                  onClick={() => setIsActionsMenuOpen((prev) => !prev)}
                  className="px-3 py-1.5 rounded-full bg-white dark:bg-[#1C1A17] hover:bg-black/5 dark:hover:bg-white/5 border border-[#ECE8E1] dark:border-[#2D2924] text-xs font-bold font-mono text-[#111110] dark:text-[#F5F3EF] inline-flex items-center gap-1.5 shadow-sm transition-all"
                  title="More Queue Actions"
                >
                  <MoreHorizontal className="w-3.5 h-3.5" />
                  <span>Actions</span>
                </button>

                {/* Dropdown ⋯ Menu */}
                {isActionsMenuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-64 rounded-2xl bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] shadow-2xl p-2 z-[250] animate-in fade-in slide-in-from-top-2 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setIsActionsMenuOpen(false);
                        setDistributionModalOpen(true);
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl hover:bg-[#F95721]/10 text-[#F95721] font-bold flex items-center justify-between gap-2 transition-colors"
                    >
                      <span>Fill Callers to 100</span>
                      <Sparkles className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsActionsMenuOpen(false);
                        const newCap = prompt("Enter target leads cap per caller:", String(targetCap));
                        if (newCap && !isNaN(Number(newCap))) {
                          setTargetCap(Math.max(10, Number(newCap)));
                          showToast(`Target cap updated to ${newCap}`);
                        }
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 text-[#111110] dark:text-[#F5F3EF] flex items-center justify-between gap-2 transition-colors"
                    >
                      <span>Adjust Target Cap</span>
                      <SlidersHorizontal className="w-3.5 h-3.5 text-[#8A8680]" />
                    </button>

                    <div className="my-1 border-t border-[#ECE8E1] dark:border-[#2D2924]" />

                    <button
                      type="button"
                      onClick={() => {
                        setIsActionsMenuOpen(false);
                        loadKanbanData(true);
                      }}
                      className="w-full text-left px-3 py-2 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 text-[#8A8680] hover:text-[#111110] flex items-center justify-between gap-2 transition-colors"
                    >
                      <span>Force Re-sync Board</span>
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Kanban Board Horizontal Lane */}
      <div className="flex gap-4 overflow-x-auto pb-6 pt-1 items-start scrollbar-thin">
        {/* ============================================================ */}
        {/* COLUMN 1: UNASSIGNED POOL (ALL SCRAPED LEADS) */}
        {/* ============================================================ */}
        <div
          onDragOver={(e) => handleDragOver(e, "unassigned_pool")}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, "unassigned_pool")}
          className={`flex flex-col min-w-[280px] sm:min-w-[320px] max-w-[340px] flex-shrink-0 bg-white dark:bg-[#1C1A17] border rounded-3xl shadow-sm transition-all ${
            dragOverColumnId === "unassigned_pool"
              ? "border-[#F95721] ring-2 ring-[#F95721]/20 bg-[#F95721]/5"
              : "border-[#ECE8E1] dark:border-[#2D2924]"
          }`}
        >
          {/* Column Header */}
          <div className="p-4 border-b border-[#ECE8E1] dark:border-[#2D2924] space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-[#111110] dark:text-[#F5F3EF]">
                  Unassigned Pool
                </h3>
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-mono text-xs font-bold border border-emerald-500/20">
                {data?.unassignedPool.totalCount ?? 0}
              </span>
            </div>
            <p className="text-[11px] text-[#6E6B66] dark:text-[#8A8680] leading-snug">
              Fresh scraped leads waiting to be distributed to callers.
            </p>

            {/* Quick Action for Managers */}
            {isManager && (
              <button
                type="button"
                onClick={() => setDistributionModalOpen(true)}
                className="w-full mt-1 py-1.5 px-3 rounded-xl bg-[#F95721]/10 hover:bg-[#F95721]/20 text-[#F95721] text-[11px] font-bold font-mono border border-[#F95721]/20 flex items-center justify-center gap-1.5 transition-colors"
              >
                <Sparkles className="w-3 h-3" />
                <span>Fill Callers (Target: {targetCap})</span>
              </button>
            )}
          </div>

          {/* Leads Cards List */}
          <div className="p-3 space-y-2.5 max-h-[70vh] overflow-y-auto pr-1">
            {data?.unassignedPool.leads.length === 0 ? (
              <div className="py-12 text-center text-[#8A8680] text-xs space-y-1">
                <Sparkles className="w-6 h-6 mx-auto text-[#8A8680] opacity-40 mb-2" />
                <p className="font-semibold">Pool is empty</p>
                <p className="text-[10px]">Import leads in Lead Ingestion to populate this pool.</p>
              </div>
            ) : (
              data?.unassignedPool.leads.map((lead) => (
                <div
                  key={lead.id}
                  draggable={isManager}
                  onDragStart={() => handleDragStart(lead)}
                  className="p-3.5 rounded-2xl bg-black/5 dark:bg-white/5 hover:border-[#F95721]/50 border border-[#ECE8E1] dark:border-[#2D2924] shadow-sm transition-all space-y-2.5 cursor-grab active:cursor-grabbing group relative"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h4
                        className="text-xs font-bold text-[#111110] dark:text-[#F5F3EF] leading-snug line-clamp-2"
                        title={formatLeadName(lead.name)}
                      >
                        {formatLeadName(lead.name)}
                      </h4>
                      <p className="text-[10px] text-[#6E6B66] dark:text-[#8A8680] mt-0.5 truncate">
                        {lead.niche} • {lead.area}
                      </p>
                    </div>

                    {/* Score Badge */}
                    <span className="shrink-0 px-2 py-0.5 rounded-md bg-[#F95721]/10 text-[#F95721] font-mono text-[10px] font-bold border border-[#F95721]/20">
                      {lead.score} pts
                    </span>
                  </div>

                  {/* Phone & Website Indicator */}
                  <div className="flex items-center justify-between text-[11px] font-mono text-[#6E6B66] dark:text-[#8A8680] pt-1 border-t border-black/5 dark:border-white/5">
                    <span className="truncate">{formatPhoneDisplay(lead.phone)}</span>
                    {lead.has_website ? (
                      <span className="text-emerald-600 dark:text-emerald-400 font-sans text-[10px] font-bold">
                        Website
                      </span>
                    ) : (
                      <span className="text-amber-600 dark:text-amber-400 font-sans text-[10px] font-bold">
                        No Site
                      </span>
                    )}
                  </div>

                  {/* Manager Quick Action / Dropdown */}
                  {isManager && (
                    <div className="pt-1 flex items-center justify-between gap-2">
                      <select
                        defaultValue=""
                        onChange={(e) => {
                          if (e.target.value) handleReassignLead(lead.id, e.target.value);
                        }}
                        className="text-[10px] font-semibold py-1 px-2 rounded-lg bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] text-[#111110] dark:text-[#F5F3EF] hover:border-[#F95721] outline-none cursor-pointer w-full"
                      >
                        <option value="" disabled>
                          Assign to caller...
                        </option>
                        {data?.callerColumns.map((c) => (
                          <option key={c.id} value={c.id}>
                            &rarr; {c.fullName} ({c.activeCount}/{c.targetCap})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* ============================================================ */}
        {/* COLUMN 2: INTERESTED PROSPECTS */}
        {/* ============================================================ */}
        <div className="flex flex-col min-w-[280px] sm:min-w-[320px] max-w-[340px] flex-shrink-0 bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] rounded-3xl shadow-sm">
          {/* Column Header */}
          <div className="p-4 border-b border-[#ECE8E1] dark:border-[#2D2924] space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />
                <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-[#111110] dark:text-[#F5F3EF]">
                  Interested Prospects
                </h3>
              </div>
              <span className="px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 font-mono text-xs font-bold border border-rose-500/20">
                {data?.interestedProspects.totalCount ?? 0}
              </span>
            </div>
            <p className="text-[11px] text-[#6E6B66] dark:text-[#8A8680] leading-snug">
              High intent leads that converted from cold calls. Ready for deal closing.
            </p>
          </div>

          {/* Interested Leads Cards List */}
          <div className="p-3 space-y-2.5 max-h-[70vh] overflow-y-auto pr-1">
            {data?.interestedProspects.leads.length === 0 ? (
              <div className="py-12 text-center text-[#8A8680] text-xs space-y-1">
                <Flame className="w-6 h-6 mx-auto text-[#8A8680] opacity-40 mb-2" />
                <p className="font-semibold">No interested prospects yet</p>
                <p className="text-[10px]">When callers log &quot;Interested (Hot)&quot;, prospects surface here.</p>
              </div>
            ) : (
              data?.interestedProspects.leads.map((lead) => (
                <div
                  key={lead.id}
                  className="p-3.5 rounded-2xl bg-rose-500/5 dark:bg-rose-500/10 border border-rose-500/20 shadow-sm transition-all space-y-2.5 relative group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Flame className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                        <span className="text-[10px] font-mono font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider">
                          Hot Prospect
                        </span>
                      </div>
                      <h4
                        className="text-xs font-bold text-[#111110] dark:text-[#F5F3EF] leading-snug line-clamp-2"
                        title={formatLeadName(lead.name)}
                      >
                        {formatLeadName(lead.name)}
                      </h4>
                      <p className="text-[10px] text-[#6E6B66] dark:text-[#8A8680] mt-0.5 truncate">
                        {lead.niche} • {lead.area}
                      </p>
                    </div>
                  </div>

                  {/* Caller attribution badge */}
                  <div className="flex items-center justify-between text-[10px] font-mono pt-1 border-t border-rose-500/10">
                    <span className="text-[#6E6B66] dark:text-[#8A8680] inline-flex items-center gap-1">
                      <User className="w-3 h-3 text-[#F95721]" />
                      <span>{lead.profiles?.full_name || "Caller"}</span>
                    </span>
                    <span className="text-[#8A8680]">{formatRelativeTime(lead.updated_at || lead.last_called_at)}</span>
                  </div>

                  {/* Phone link */}
                  <div className="flex items-center justify-between text-[11px] font-mono pt-1">
                    <span className="text-[#111110] dark:text-[#F5F3EF] font-bold">
                      {formatPhoneDisplay(lead.phone)}
                    </span>
                    {onSelectLeadForDial && (
                      <button
                        type="button"
                        onClick={() => onSelectLeadForDial(lead)}
                        className="px-2.5 py-1 rounded-lg bg-rose-500 hover:bg-rose-600 text-white font-sans text-[10px] font-bold inline-flex items-center gap-1 transition-transform active:scale-95 shadow-sm"
                      >
                        <span>Dial</span>
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ============================================================ */}
        {/* COLUMNS 3..N: LEADS ASSIGNED TO EACH CALLER */}
        {/* ============================================================ */}
        {filteredCallerColumns.map((col) => {
          const colDragId = `caller_${col.id}`;
          const isOver = dragOverColumnId === colDragId;

          return (
            <div
              key={col.id}
              onDragOver={(e) => handleDragOver(e, colDragId)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, colDragId)}
              className={`flex flex-col min-w-[280px] sm:min-w-[320px] max-w-[340px] flex-shrink-0 bg-white dark:bg-[#1C1A17] border rounded-3xl shadow-sm transition-all ${
                isOver
                  ? "border-[#F95721] ring-2 ring-[#F95721]/20 bg-[#F95721]/5"
                  : "border-[#ECE8E1] dark:border-[#2D2924]"
              }`}
            >
              {/* Caller Header Card */}
              <div className="p-4 border-b border-[#ECE8E1] dark:border-[#2D2924] space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                        col.isOnline ? "bg-emerald-500" : "bg-stone-400"
                      }`}
                    />
                    <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-[#111110] dark:text-[#F5F3EF] truncate">
                      {col.fullName}
                    </h3>
                  </div>

                  <span
                    className={`px-2.5 py-0.5 rounded-full font-mono text-xs font-bold border ${
                      col.activeCount >= col.targetCap
                        ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
                        : col.activeCount > 0
                        ? "bg-[#F95721]/10 text-[#F95721] border-[#F95721]/20"
                        : "bg-black/5 dark:bg-white/5 text-[#8A8680] border-[#ECE8E1] dark:border-[#2D2924]"
                    }`}
                  >
                    {col.activeCount} / {col.targetCap}
                  </span>
                </div>

                {/* Queue Fill Progress Bar */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-mono text-[#6E6B66] dark:text-[#8A8680]">
                    <span>Fill: {col.fillPercentage}%</span>
                    <span>{col.dialsToday} dials today</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-black/5 dark:bg-white/5 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        col.fillPercentage >= 100
                          ? "bg-blue-500"
                          : col.fillPercentage >= 50
                          ? "bg-[#F95721]"
                          : "bg-amber-500"
                      }`}
                      style={{ width: `${col.fillPercentage}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Assigned Caller Leads Cards List */}
              <div className="p-3 space-y-2.5 max-h-[70vh] overflow-y-auto pr-1">
                {col.leads.length === 0 ? (
                  <div className="py-12 text-center text-[#8A8680] text-xs space-y-1">
                    <Clock className="w-6 h-6 mx-auto text-[#8A8680] opacity-40 mb-2" />
                    <p className="font-semibold">Queue is clear</p>
                    <p className="text-[10px]">
                      {col.activeCount === 0
                        ? "No active leads assigned. Daily top-up will allocate 100 leads."
                        : `${col.activeCount} leads assigned (in cooldown).`}
                    </p>
                  </div>
                ) : (
                  col.leads.map((lead, idx) => (
                    <div
                      key={lead.id}
                      draggable={isManager}
                      onDragStart={() => handleDragStart(lead)}
                      className="p-3.5 rounded-2xl bg-black/5 dark:bg-white/5 hover:border-[#F95721]/50 border border-[#ECE8E1] dark:border-[#2D2924] shadow-sm transition-all space-y-2.5 cursor-grab active:cursor-grabbing group relative"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-[10px] font-mono font-bold text-[#F95721]">
                              #{idx + 1}
                            </span>
                            <span
                              className={`px-2 py-0.2 rounded text-[9px] font-mono font-bold uppercase tracking-wide ${
                                lead.status === "callback"
                                  ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                                  : lead.status === "no_answer"
                                  ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                  : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                              }`}
                            >
                              {lead.status.replace("_", " ")}
                            </span>
                          </div>

                          <h4
                            className="text-xs font-bold text-[#111110] dark:text-[#F5F3EF] leading-snug line-clamp-2"
                            title={formatLeadName(lead.name)}
                          >
                            {formatLeadName(lead.name)}
                          </h4>
                          <p className="text-[10px] text-[#6E6B66] dark:text-[#8A8680] mt-0.5 truncate">
                            {lead.niche} • {lead.area}
                          </p>
                        </div>

                        {/* Attempt Counter */}
                        <span className="shrink-0 text-[10px] font-mono text-[#8A8680] flex items-center gap-0.5">
                          <Clock className="w-3 h-3 text-[#F95721]" />
                          <span>{lead.attempts_count || 0}/5</span>
                        </span>
                      </div>

                      {/* Phone & Direct Dial CTA */}
                      <div className="flex items-center justify-between text-[11px] font-mono pt-1 border-t border-black/5 dark:border-white/5">
                        <span className="truncate">{formatPhoneDisplay(lead.phone)}</span>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {/* Copy button */}
                          <button
                            type="button"
                            onClick={() => {
                              if (lead.phone) {
                                navigator.clipboard.writeText(lead.phone);
                                setCopiedId(lead.id);
                                setTimeout(() => setCopiedId(null), 1500);
                              }
                            }}
                            className="p-1 rounded-md text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF]"
                            title="Copy phone"
                          >
                            {copiedId === lead.id ? (
                              <Check className="w-3 h-3 text-emerald-500" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>

                          {/* Dial Lead CTA */}
                          {onSelectLeadForDial && (
                            <button
                              type="button"
                              onClick={() => onSelectLeadForDial(lead)}
                              className="px-2.5 py-1 rounded-lg bg-[#F95721] hover:bg-[#E04612] text-white font-sans text-[10px] font-bold inline-flex items-center gap-1 transition-transform active:scale-95 shadow-sm"
                            >
                              <PhoneCall className="w-3 h-3" />
                              <span>Dial</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Manager Reassign / Move */}
                      {isManager && (
                        <div className="pt-1">
                          <select
                            value={col.id}
                            onChange={(e) => {
                              if (e.target.value === "unassign") {
                                handleReassignLead(lead.id, null);
                              } else if (e.target.value !== col.id) {
                                handleReassignLead(lead.id, e.target.value);
                              }
                            }}
                            className="text-[10px] font-semibold py-0.5 px-2 rounded-lg bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF] outline-none cursor-pointer w-full"
                          >
                            <option value={col.id}>Assigned to {col.fullName}</option>
                            <option value="unassign">&rarr; Return to Unassigned Pool</option>
                            {data?.callerColumns
                              .filter((c) => c.id !== col.id)
                              .map((c) => (
                                <option key={c.id} value={c.id}>
                                  &rarr; Move to {c.fullName} ({c.activeCount}/{c.targetCap})
                                </option>
                              ))}
                          </select>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ============================================================ */}
      {/* DESTRUCTIVE / SENSITIVE ACTION MODAL (Confirmation Dialog)    */}
      {/* Rule: Destructive action -> Behind a confirmation dialog    */}
      {/* ============================================================ */}
      {distributionModalOpen && (
        <div className="fixed inset-0 z-[350] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] rounded-3xl p-6 shadow-2xl space-y-4">
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-3 border-b border-[#ECE8E1] dark:border-[#2D2924]">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-[#F95721]" />
                <div>
                  <h3 className="text-base font-bold text-[#111110] dark:text-[#F5F3EF]">
                    Execute Daily Lead Distribution
                  </h3>
                  <p className="text-xs text-[#6E6B66] dark:text-[#8A8680]">
                    Depth-aware automatic queue top-up to target cap {targetCap}.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setDistributionModalOpen(false)}
                className="text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF] p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Fictional Scenario Breakdown */}
            <div className="space-y-3 text-xs">
              <p className="text-[#111110] dark:text-[#F5F3EF] leading-relaxed">
                The depth-aware algorithm calculates{" "}
                <code className="text-[#F95721] font-mono font-bold">needed = target_cap ({targetCap}) - current_load</code>{" "}
                for each active caller, prioritizing the lightest caller first to equalize workloads.
              </p>

              <div className="p-3.5 rounded-2xl bg-black/5 dark:bg-white/5 space-y-2 border border-[#ECE8E1] dark:border-[#2D2924]">
                <div className="flex items-center justify-between font-mono text-[11px]">
                  <span className="text-[#8A8680]">Unassigned Pool Available:</span>
                  <strong className="text-emerald-600 dark:text-emerald-400">
                    {data?.summary.unassignedPoolCount ?? 0} leads
                  </strong>
                </div>
                <div className="flex items-center justify-between font-mono text-[11px]">
                  <span className="text-[#8A8680]">Total Needed Across Callers:</span>
                  <strong className="text-[#111110] dark:text-[#F5F3EF]">
                    {data?.callerColumns.reduce((acc, c) => acc + Math.max(0, targetCap - c.activeCount), 0) ?? 0} leads
                  </strong>
                </div>
                <div className="flex items-center justify-between font-mono text-[11px]">
                  <span className="text-[#8A8680]">Active Callers Receiving:</span>
                  <strong className="text-[#111110] dark:text-[#F5F3EF]">
                    {data?.callerColumns.length ?? 0} callers
                  </strong>
                </div>

                {(data?.summary.unassignedPoolCount ?? 0) <
                  (data?.callerColumns.reduce((acc, c) => acc + Math.max(0, targetCap - c.activeCount), 0) ?? 0) && (
                  <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-[10px] flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>Pool constrained. Leads will equalize lightest callers first.</span>
                  </div>
                )}

                <div className="pt-2 border-t border-black/5 dark:border-white/5 space-y-1">
                  {data?.callerColumns.map((c) => {
                    const needed = Math.max(0, targetCap - c.activeCount);
                    return (
                      <div key={c.id} className="flex items-center justify-between font-mono text-[11px]">
                        <span className="text-[#6E6B66] dark:text-[#8A8680]">{c.fullName}:</span>
                        <span>
                          holds {c.activeCount} &rarr; <strong className="text-[#F95721]">needs +{needed}</strong>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="pt-3 border-t border-[#ECE8E1] dark:border-[#2D2924] flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setDistributionModalOpen(false)}
                disabled={isDistributing}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF]"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={async () => {
                  await handleExecuteDistribution();
                  setDistributionModalOpen(false);
                }}
                disabled={isDistributing || (data?.summary.unassignedPoolCount ?? 0) === 0}
                className="px-5 py-2.5 rounded-xl bg-[#F95721] hover:bg-[#E04612] text-white text-xs font-bold font-mono inline-flex items-center gap-2 shadow-md transition-all active:scale-95 disabled:opacity-50"
              >
                {isDistributing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Distributing...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Confirm & Distribute Now</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
