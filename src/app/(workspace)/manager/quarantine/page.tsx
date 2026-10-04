"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  ShieldAlert,
  Users,
  Search,
  RefreshCw,
  Clock,
  LifeBuoy,
  User,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Phone,
  MapPin,
  Tag,
  X,
  HelpCircle,
  RotateCcw,
  Check,
  Copy,
  Inbox,
  Filter,
} from "lucide-react";

interface QuarantinedLead {
  id: string;
  name: string;
  phone: string;
  normalized_phone?: string;
  niche: string;
  area: string;
  score: number;
  attempts_count: number;
  rejected_by: string | null;
  disposing_caller?: string;
  disposing_caller_id?: string | null;
  rejection_reason: string | null;
  quarantined_at: string | null;
  disposal_scheduled_at: string | null;
  created_at: string;
}

interface ActiveCaller {
  id: string;
  full_name: string;
  role: string;
  is_available: boolean;
  active: boolean;
}

type RescueChoice = "original" | "unassigned" | "specific";

function getCountdownDisplay(
  disposalScheduledAt: string | null,
  quarantinedAt: string | null
): { text: string; badgeClass: string; isUrgent: boolean } {
  const targetDate = disposalScheduledAt
    ? new Date(disposalScheduledAt)
    : quarantinedAt
    ? new Date(new Date(quarantinedAt).getTime() + 7 * 24 * 60 * 60 * 1000)
    : null;

  if (!targetDate) {
    return {
      text: "7 days left",
      badgeClass: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
      isUrgent: false,
    };
  }

  const diffMs = targetDate.getTime() - Date.now();
  if (diffMs <= 0) {
    return {
      text: "Disposal Due (Nightly Purge)",
      badgeClass: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20 animate-pulse font-bold",
      isUrgent: true,
    };
  }

  const hoursTotal = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(hoursTotal / 24);
  const hours = hoursTotal % 24;

  if (days >= 2) {
    return {
      text: `${days}d ${hours}h left`,
      badgeClass: "bg-black/5 dark:bg-white/5 text-[#6E6B66] dark:text-[#8A8680] border-[#ECE8E1] dark:border-[#2D2924]",
      isUrgent: false,
    };
  }

  if (days === 1) {
    return {
      text: `1d ${hours}h left`,
      badgeClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 font-semibold",
      isUrgent: false,
    };
  }

  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  return {
    text: `${hours}h ${minutes}m left`,
    badgeClass: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20 font-bold",
    isUrgent: true,
  };
}

export default function ManagerQuarantinePage() {
  const [leads, setLeads] = useState<QuarantinedLead[]>([]);
  const [activeCallers, setActiveCallers] = useState<ActiveCaller[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [reasonFilter, setReasonFilter] = useState<string>("all");
  const [copiedPhoneId, setCopiedPhoneId] = useState<string | null>(null);

  // Rescue Modal State
  const [targetLead, setTargetLead] = useState<QuarantinedLead | null>(null);
  const [rescueChoice, setRescueChoice] = useState<RescueChoice>("unassigned");
  const [selectedCallerId, setSelectedCallerId] = useState<string>("");
  const [isRescuing, setIsRescuing] = useState(false);
  const [rescueError, setRescueError] = useState<string | null>(null);
  const [rescueSuccess, setRescueSuccess] = useState<string | null>(null);

  const fetchQuarantineData = useCallback(async (isManual: boolean = false) => {
    if (isManual) {
      setRefreshing(true);
    }
    try {
      const res = await fetch("/api/manager/quarantine");
      if (res.ok) {
        const data = await res.json();
        setLeads(data.leads || []);
        setActiveCallers(data.active_callers || []);
      } else {
        console.warn("Failed to fetch quarantine bin:", res.status);
      }
    } catch (err) {
      console.warn("Quarantine bin network error:", err);
    } finally {
      setLoading(false);
      if (isManual) {
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchQuarantineData();
  }, [fetchQuarantineData]);

  // Periodic ticker for disposal countdown accuracy
  useEffect(() => {
    const timer = setInterval(() => {
      // triggers re-render of countdowns every 30s
      setLeads((prev) => [...prev]);
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  // Filtered and sorted leads
  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      const query = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !query ||
        lead.name.toLowerCase().includes(query) ||
        lead.phone.toLowerCase().includes(query) ||
        (lead.niche && lead.niche.toLowerCase().includes(query)) ||
        (lead.area && lead.area.toLowerCase().includes(query)) ||
        (lead.disposing_caller && lead.disposing_caller.toLowerCase().includes(query));

      if (!matchesSearch) return false;

      if (reasonFilter !== "all") {
        if (!lead.rejection_reason) return false;
        return lead.rejection_reason.toLowerCase().includes(reasonFilter.toLowerCase());
      }

      return true;
    });
  }, [leads, searchQuery, reasonFilter]);

  function handleOpenRescueModal(lead: QuarantinedLead) {
    setTargetLead(lead);
    setRescueError(null);
    setRescueSuccess(null);

    // Default to returning to original caller ONLY if they are an active caller, otherwise unassigned
    const isOriginalCallerActive = Boolean(
      lead.rejected_by && activeCallers.some((c) => c.id === lead.rejected_by)
    );

    if (isOriginalCallerActive) {
      setRescueChoice("original");
    } else {
      setRescueChoice("unassigned");
    }

    if (activeCallers.length > 0) {
      setSelectedCallerId(activeCallers[0].id);
    }
  }

  function handleCloseRescueModal() {
    setTargetLead(null);
    setIsRescuing(false);
    setRescueError(null);
    setRescueSuccess(null);
  }

  async function handleExecuteRescue(e: React.FormEvent) {
    e.preventDefault();
    if (!targetLead) return;

    if (rescueChoice === "specific" && !selectedCallerId) {
      setRescueError("Please select a target caller from the roster");
      return;
    }

    setIsRescuing(true);
    setRescueError(null);

    try {
      const res = await fetch("/api/manager/quarantine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: targetLead.id,
          choice: rescueChoice,
          target_caller_id: rescueChoice === "specific" ? selectedCallerId : undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "Failed to rescue lead from quarantine");
      }

      // Remove from quarantined leads locally
      setLeads((prev) => prev.filter((l) => l.id !== targetLead.id));
      setRescueSuccess(
        `Lead "${targetLead.name}" has been successfully rescued and returned to active circulation!`
      );

      setTimeout(() => {
        handleCloseRescueModal();
      }, 1500);
    } catch (err: any) {
      setRescueError(err.message || "Failed to complete rescue operation");
    } finally {
      setIsRescuing(false);
    }
  }

  function handleCopyPhone(leadId: string, phone: string) {
    navigator.clipboard.writeText(phone);
    setCopiedPhoneId(leadId);
    setTimeout(() => setCopiedPhoneId(null), 2000);
  }

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-12">
      {/* Header & Sub-Navigation */}
      <div className="pb-4 border-b border-[#ECE8E1] dark:border-[#2D2924] pt-2 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <span className="text-[11px] font-mono tracking-widest uppercase text-[#F95721] font-semibold">
            LEAD LIFECYCLE RECOVERY
          </span>
          <h1 className="text-3xl sm:text-4xl font-black text-[#111110] dark:text-[#F5F3EF] tracking-tight mt-1">
            Quarantine holding bin.
          </h1>
          <p className="text-xs text-[#6E6B66] dark:text-[#8A8680] mt-1.5">
            Leads rejected by callers or auto-quarantined after 5 exhausted dial attempts. Locked for 7 days before automated soft-deletion.
          </p>
        </div>

        {/* Manager Navigation Pills */}
        <div className="flex items-center gap-1.5 p-1 bg-black/5 dark:bg-white/5 rounded-2xl border border-[#ECE8E1] dark:border-[#2D2924] shrink-0 self-start md:self-auto overflow-x-auto max-w-full">
          <Link
            href="/studio/manager/team"
            className="px-3 py-1.5 rounded-xl text-xs font-medium text-[#6E6B66] dark:text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF] hover:bg-black/5 dark:hover:bg-white/5 transition-all flex items-center gap-1.5 shrink-0"
          >
            <Users className="w-3.5 h-3.5" />
            <span>Team Roster</span>
          </Link>
          <Link
            href="/studio/manager/quarantine"
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#F95721] text-white shadow-sm transition-all flex items-center gap-1.5 shrink-0"
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Quarantine</span>
          </Link>
          <Link
            href="/studio/manager/invites"
            className="px-3 py-1.5 rounded-xl text-xs font-medium text-[#6E6B66] dark:text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF] hover:bg-black/5 dark:hover:bg-white/5 transition-all shrink-0"
          >
            Invites
          </Link>
          <Link
            href="/studio/manager/ingestion"
            className="px-3 py-1.5 rounded-xl text-xs font-medium text-[#6E6B66] dark:text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF] hover:bg-black/5 dark:hover:bg-white/5 transition-all shrink-0"
          >
            CSV Ingestion
          </Link>
        </div>
      </div>

      {/* Top Banner & Control Bar */}
      <div className="p-4 rounded-3xl bg-amber-500/10 border border-amber-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-2xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-amber-900 dark:text-amber-300">
              7-Day Holding Lock Active
            </h4>
            <p className="text-[11px] text-amber-800/80 dark:text-amber-400/80 mt-0.5">
              Quarantined leads are hidden from all caller active queues. The nightly worker permanently archives expired leads at 02:00 UTC.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
          <span className="text-xs font-mono font-bold px-3 py-1 rounded-xl bg-white dark:bg-[#1C1A17] text-[#111110] dark:text-[#F5F3EF] border border-[#ECE8E1] dark:border-[#2D2924]">
            {leads.length} in Bin
          </span>
          <button
            type="button"
            onClick={() => fetchQuarantineData(true)}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1 bg-white dark:bg-[#1C1A17] hover:bg-black/5 dark:hover:bg-white/5 rounded-xl text-xs font-medium text-[#111110] dark:text-[#F5F3EF] border border-[#ECE8E1] dark:border-[#2D2924] transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#F95721] ${refreshing ? "animate-spin" : ""}`} />
            <span>{refreshing ? "Syncing..." : "Refresh"}</span>
          </button>
        </div>
      </div>

      {/* Search & Reason Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8A8680]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by business, phone, or caller..."
            className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] focus:border-[#F95721] rounded-2xl text-xs text-[#111110] dark:text-[#F5F3EF] outline-none shadow-sm transition-all"
          />
        </div>

        <div className="flex items-center gap-2 text-xs">
          <Filter className="w-3.5 h-3.5 text-[#8A8680]" />
          <span className="text-[#8A8680] text-[11px] font-medium hidden sm:inline">Filter reason:</span>
          <select
            value={reasonFilter}
            onChange={(e) => setReasonFilter(e.target.value)}
            className="px-3 py-2 bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] rounded-2xl text-xs text-[#111110] dark:text-[#F5F3EF] outline-none shadow-sm focus:border-[#F95721]"
          >
            <option value="all">All Rejection Reasons</option>
            <option value="budget">Budget / Price</option>
            <option value="agency">Already Has Agency</option>
            <option value="website">Not Interested in Website</option>
            <option value="rudely">Hostile / Do Not Follow Up</option>
            <option value="exhausted">Cadence Exhausted (5x)</option>
          </select>
        </div>
      </div>

      {/* Quarantined Leads List */}
      {loading ? (
        <div className="p-12 text-center rounded-3xl bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924]">
          <RefreshCw className="w-6 h-6 animate-spin text-[#F95721] mx-auto mb-2" />
          <p className="text-xs text-[#8A8680]">Scanning quarantine holding bin...</p>
        </div>
      ) : filteredLeads.length === 0 ? (
        <div className="p-14 text-center rounded-3xl bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924]">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center mx-auto mb-3">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-[#111110] dark:text-[#F5F3EF]">Quarantine Bin is Empty</h3>
          <p className="text-xs text-[#8A8680] mt-1 max-w-md mx-auto">
            {searchQuery
              ? `No quarantined leads matched "${searchQuery}".`
              : "No rejected leads are currently locked in quarantine. Your active pipeline is flowing smoothly."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredLeads.map((lead) => {
            const countdown = getCountdownDisplay(lead.disposal_scheduled_at, lead.quarantined_at);
            const formattedQuarantinedAt = lead.quarantined_at
              ? new Date(lead.quarantined_at).toLocaleDateString([], {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "Recently";

            return (
              <div
                key={lead.id}
                className="p-5 rounded-3xl bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] shadow-sm hover:border-[#F95721]/30 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                {/* Left: Lead Identity & Phone */}
                <div className="space-y-1.5 min-w-0 md:w-1/3">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-[#111110] dark:text-[#F5F3EF] truncate">
                      {lead.name}
                    </h4>
                    <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-mono bg-black/5 dark:bg-white/5 text-[#8A8680]">
                      {lead.attempts_count} {lead.attempts_count === 1 ? "attempt" : "attempts"}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-[#6E6B66] dark:text-[#8A8680]">
                    <button
                      type="button"
                      onClick={() => handleCopyPhone(lead.id, lead.phone)}
                      className="inline-flex items-center gap-1 font-mono hover:text-[#F95721] transition-colors"
                      title="Click to copy phone number"
                    >
                      <Phone className="w-3.5 h-3.5 text-[#F95721]" />
                      <span>{lead.phone}</span>
                      {copiedPhoneId === lead.id ? (
                        <Check className="w-3 h-3 text-emerald-500" />
                      ) : (
                        <Copy className="w-3 h-3 text-[#8A8680]" />
                      )}
                    </button>
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-[#8A8680]">
                    <span className="flex items-center gap-1">
                      <Tag className="w-3 h-3 text-[#F95721]" />
                      <span>{lead.niche || "General"}</span>
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1 truncate">
                      <MapPin className="w-3 h-3" />
                      <span>{lead.area || "City"}</span>
                    </span>
                  </div>
                </div>

                {/* Center: Disposing Caller & Rejection Reason */}
                <div className="space-y-1.5 md:w-1/3 text-xs">
                  <div className="flex items-center gap-1.5 text-[#6E6B66] dark:text-[#8A8680]">
                    <User className="w-3.5 h-3.5 text-[#F95721]" />
                    <span>Disposed by:</span>
                    <strong className="text-[#111110] dark:text-[#F5F3EF] truncate">
                      {lead.disposing_caller}
                    </strong>
                  </div>

                  <div className="p-2 rounded-xl bg-black/[0.03] dark:bg-white/[0.03] border border-[#ECE8E1]/80 dark:border-[#2D2924]/80">
                    <span className="text-[10px] font-mono uppercase text-[#8A8680] block font-semibold">
                      Rejection Reason
                    </span>
                    <p className="text-xs text-[#111110] dark:text-[#F5F3EF] mt-0.5 line-clamp-2">
                      {lead.rejection_reason || "Cadence attempts exhausted without conversation."}
                    </p>
                  </div>

                  <p className="text-[10px] text-[#8A8680] font-mono">
                    Quarantined: {formattedQuarantinedAt}
                  </p>
                </div>

                {/* Right: Countdown Timer & Rescue Action */}
                <div className="flex flex-row md:flex-col items-center md:items-end justify-between gap-3 shrink-0">
                  <div className="text-left md:text-right">
                    <span className="text-[10px] font-mono uppercase text-[#8A8680] block mb-1">
                      Auto-Disposal Clock
                    </span>
                    <span
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs border ${countdown.badgeClass}`}
                    >
                      <Clock className="w-3 h-3" />
                      <span>{countdown.text}</span>
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleOpenRescueModal(lead)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-[#F95721] hover:opacity-90 text-white rounded-xl text-xs font-bold shadow-sm transition-all group"
                  >
                    <LifeBuoy className="w-3.5 h-3.5 group-hover:rotate-45 transition-transform" />
                    <span>Rescue Lead</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 3-Way Rescue Modal */}
      {targetLead && (
        <div className="fixed inset-0 z-[400] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className="w-full max-w-lg rounded-3xl bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] shadow-2xl p-6 overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-3 border-b border-[#ECE8E1] dark:border-[#2D2924]">
              <div>
                <span className="text-[10px] font-mono tracking-widest uppercase text-[#F95721] font-semibold">
                  LEAD RESTORATION
                </span>
                <h3 className="text-lg font-black text-[#111110] dark:text-[#F5F3EF] tracking-tight mt-0.5">
                  Rescue Lead from Quarantine
                </h3>
              </div>
              <button
                type="button"
                onClick={handleCloseRescueModal}
                className="p-1 rounded-xl text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF] hover:bg-black/5 dark:hover:bg-white/5"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Target Lead Information Card */}
            <div className="my-4 p-4 rounded-2xl bg-black/5 dark:bg-white/5 border border-[#ECE8E1] dark:border-[#2D2924]">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-[#111110] dark:text-[#F5F3EF]">
                  {targetLead.name}
                </h4>
                <span className="font-mono text-xs text-[#F95721]">
                  {targetLead.phone}
                </span>
              </div>
              <p className="text-xs text-[#6E6B66] dark:text-[#8A8680] mt-1">
                Rejected by: <strong>{targetLead.disposing_caller}</strong> • Reason: &ldquo;{targetLead.rejection_reason || "Attempts exhausted"}&rdquo;
              </p>
            </div>

            {rescueSuccess ? (
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{rescueSuccess}</span>
              </div>
            ) : (
              <form onSubmit={handleExecuteRescue} className="space-y-4">
                <label className="text-xs font-semibold text-[#111110] dark:text-[#F5F3EF] block">
                  Select Rescue Destination:
                </label>

                {/* 3-Way Choice Cards */}
                <div className="space-y-2.5">
                  {/* Choice 1: Return to Original Caller */}
                  {(() => {
                    const isCallerActive = Boolean(
                      targetLead.rejected_by && activeCallers.some((c) => c.id === targetLead.rejected_by)
                    );
                    return (
                      <label
                        className={`block p-3.5 rounded-2xl border transition-all ${
                          !isCallerActive
                            ? "opacity-40 cursor-not-allowed bg-black/[0.02] dark:bg-white/[0.02] border-[#ECE8E1] dark:border-[#2D2924]"
                            : rescueChoice === "original"
                            ? "bg-[#F95721]/5 border-[#F95721] text-[#111110] dark:text-[#F5F3EF] cursor-pointer"
                            : "bg-white dark:bg-[#1C1A17] border-[#ECE8E1] dark:border-[#2D2924] opacity-80 hover:opacity-100 cursor-pointer"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="radio"
                            name="rescueChoice"
                            value="original"
                            disabled={!isCallerActive}
                            checked={rescueChoice === "original"}
                            onChange={() => setRescueChoice("original")}
                            className="mt-1 text-[#F95721] focus:ring-[#F95721]"
                          />
                          <div className="min-w-0">
                            <span className="text-xs font-bold block">
                              1. Return to Original Caller
                            </span>
                            <span className="text-[11px] text-[#6E6B66] dark:text-[#8A8680] block mt-0.5">
                              {targetLead.rejected_by
                                ? isCallerActive
                                  ? `Route lead back to ${targetLead.disposing_caller}'s active queue for another pass.`
                                  : `Original teammate (${targetLead.disposing_caller}) is no longer an active caller (promoted or inactive).`
                                : "Original disposing caller record not found (lead was system-quarantined)."}
                            </span>
                          </div>
                        </div>
                      </label>
                    );
                  })()}

                  {/* Choice 2: Move to Unassigned Pool */}
                  <label
                    className={`block p-3.5 rounded-2xl border cursor-pointer transition-all ${
                      rescueChoice === "unassigned"
                        ? "bg-[#F95721]/5 border-[#F95721] text-[#111110] dark:text-[#F5F3EF]"
                        : "bg-white dark:bg-[#1C1A17] border-[#ECE8E1] dark:border-[#2D2924] opacity-80 hover:opacity-100"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="radio"
                        name="rescueChoice"
                        value="unassigned"
                        checked={rescueChoice === "unassigned"}
                        onChange={() => setRescueChoice("unassigned")}
                        className="mt-1 text-[#F95721] focus:ring-[#F95721]"
                      />
                      <div className="min-w-0">
                        <span className="text-xs font-bold block">
                          2. Move to Unassigned Pool
                        </span>
                        <span className="text-[11px] text-[#6E6B66] dark:text-[#8A8680] block mt-0.5">
                          Clear caller assignment (`assigned_to = null`). Lead becomes available to any caller in the common round-robin deck.
                        </span>
                      </div>
                    </div>
                  </label>

                  {/* Choice 3: Reassign to Specific Caller */}
                  <label
                    className={`block p-3.5 rounded-2xl border cursor-pointer transition-all ${
                      rescueChoice === "specific"
                        ? "bg-[#F95721]/5 border-[#F95721] text-[#111110] dark:text-[#F5F3EF]"
                        : "bg-white dark:bg-[#1C1A17] border-[#ECE8E1] dark:border-[#2D2924] opacity-80 hover:opacity-100"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="radio"
                        name="rescueChoice"
                        value="specific"
                        checked={rescueChoice === "specific"}
                        onChange={() => setRescueChoice("specific")}
                        className="mt-1 text-[#F95721] focus:ring-[#F95721]"
                      />
                      <div className="min-w-0 w-full">
                        <span className="text-xs font-bold block">
                          3. Reassign to Specific Caller
                        </span>
                        <span className="text-[11px] text-[#6E6B66] dark:text-[#8A8680] block mt-0.5">
                          Pick a closer or top-performing outbound agent to revitalize the opportunity.
                        </span>

                        {rescueChoice === "specific" && (
                          <div className="mt-3">
                            <select
                              value={selectedCallerId}
                              onChange={(e) => setSelectedCallerId(e.target.value)}
                              className="w-full text-xs px-3 py-2 bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] focus:border-[#F95721] rounded-xl text-[#111110] dark:text-[#F5F3EF] outline-none"
                            >
                              {activeCallers.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.full_name} ({c.role}) {c.is_available ? "• Available" : "• Offline"}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    </div>
                  </label>
                </div>

                <div className="p-3 rounded-xl bg-blue-500/10 text-blue-700 dark:text-blue-400 text-[11px] flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>
                    Rescuing atomically clears `quarantined_at`, `disposal_scheduled_at`, `rejection_reason`, and `rejected_by`.
                  </span>
                </div>

                {rescueError && (
                  <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{rescueError}</span>
                  </div>
                )}

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={handleCloseRescueModal}
                    disabled={isRescuing}
                    className="flex-1 py-2.5 rounded-2xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-xs font-semibold text-[#6E6B66] dark:text-[#8A8680] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isRescuing}
                    className="flex-1 py-2.5 rounded-2xl bg-[#F95721] hover:opacity-90 disabled:opacity-50 text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                  >
                    {isRescuing && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                    <span>{isRescuing ? "Rescuing..." : "Confirm & Rescue Lead"}</span>
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
