"use client";

import React, { useState } from "react";
import {
  PhoneCall,
  Clock,
  Globe,
  MapPin,
  Sparkles,
  ChevronRight,
  ChevronDown,
  Copy,
  Check,
  User,
  FileText,
  ExternalLink,
  X,
  Loader2,
  CheckCircle,
  RefreshCw,
} from "lucide-react";
import { EntityComments } from "@/components/comms/EntityComments";
import { Lead, CallLogSummary } from "./CallerCockpit";

export interface CallerInfo {
  id: string;
  full_name: string;
  lead_count: number;
}

interface AdminQueueProps {
  leads: Lead[];
  activeLeadIndex: number;
  setActiveLeadIndex: (idx: number) => void;
  currentLead: Lead | null;
  callActive: boolean;
  callElapsedSeconds: number;
  handleStartCall: () => void;
  setIsDrawerOpen: (open: boolean) => void;
  latestCallNote: CallLogSummary | null;
  loadingNote: boolean;
  impersonatedCaller: any;
  userRole: string;
  currentUserId: string | null;
  callersList: CallerInfo[];
  handleReassignLead: (leadId: string, callerId: string) => void;
  isReassigning: boolean;
  queueScope: string;
  handleScopeChange: (scope: string) => void;
  totalPoolCount: number;
  unassignedPoolCount: number;
  copiedPhone: boolean;
  setCopiedPhone: (copied: boolean) => void;
  loadLeads: () => void;
  onSwitchToCockpit?: () => void;
}

function formatLeadName(name: string) {
  if (!name) return "";
  return name
    .toLowerCase()
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatPhoneDisplay(phone: string | null | undefined): string {
  if (!phone) return "No Phone";
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length === 10) {
    return `+91 ${cleaned.slice(0, 5)} ${cleaned.slice(5)}`;
  }
  if (cleaned.length === 12 && cleaned.startsWith("91")) {
    return `+91 ${cleaned.slice(2, 7)} ${cleaned.slice(7)}`;
  }
  return phone;
}

function formatTelLink(phone: string | null | undefined): string {
  if (!phone) return "";
  const cleaned = phone.trim();
  if (cleaned.startsWith("+91")) {
    return `tel:+91${cleaned.slice(3).replace(/\D/g, "")}`;
  }
  const digits = cleaned.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("0")) {
    return `tel:+91${digits.slice(1)}`;
  }
  if (digits.length === 12 && digits.startsWith("91")) {
    return `tel:+91${digits.slice(2)}`;
  }
  return `tel:+91${digits}`;
}

function resolveDecisionMaker(lead: Lead | null): string {
  if (!lead) return "Decision Maker";
  if (lead.decision_maker) return lead.decision_maker;
  const name = lead.name || "";
  const match = name.match(/^(Dr\.?\s+[A-Za-z]+|Mr\.?\s+[A-Za-z]+|Mrs\.?\s+[A-Za-z]+|Ms\.?\s+[A-Za-z]+)/i);
  if (match) return `${match[0]} — Owner / Lead Doctor`;
  return "Owner / Managing Director";
}

function formatDurationTimer(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

function formatRelativeTime(isoString: string): string {
  try {
    const diff = Date.now() - new Date(isoString).getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours < 1) return "Just now";
    if (hours === 1) return "1h ago";
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return "Yesterday";
    return `${days}d ago`;
  } catch {
    return "";
  }
}

export function AdminQueue({
  leads,
  activeLeadIndex,
  setActiveLeadIndex,
  currentLead,
  callActive,
  callElapsedSeconds,
  handleStartCall,
  setIsDrawerOpen,
  latestCallNote,
  loadingNote,
  impersonatedCaller,
  userRole,
  currentUserId,
  callersList,
  handleReassignLead,
  isReassigning,
  queueScope,
  handleScopeChange,
  totalPoolCount,
  unassignedPoolCount,
  copiedPhone,
  setCopiedPhone,
  loadLeads,
  onSwitchToCockpit,
}: AdminQueueProps) {
  const [isMirrorDetailsOpen, setIsMirrorDetailsOpen] = useState(false);

  // Label for active filter scope
  let activeScopeLabel = "All Active Leads";
  if (impersonatedCaller) activeScopeLabel = `${impersonatedCaller.full_name}'s Deck`;
  else if (queueScope === "unassigned") activeScopeLabel = "Unassigned Pool";
  else if (queueScope === "assigned") activeScopeLabel = "All Assigned Leads";
  else if (queueScope === "mine") activeScopeLabel = "My Assigned Queue";
  else if (queueScope.startsWith("caller_")) {
    const callerId = queueScope.replace("caller_", "");
    const caller = callersList.find((c) => c.id === callerId);
    activeScopeLabel = caller ? `${caller.full_name}'s Queue` : "Caller Queue";
  }

  return (
    <div className="space-y-6 max-w-full overflow-x-hidden pb-12">
      {/* Sleek Compact Header Bar */}
      <div className="flex items-center justify-between gap-3 pt-1 pb-1">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="text-xs font-mono tracking-wider uppercase text-[#F95721] font-bold">
            OUTBOUND DECK
          </span>
          <span className="px-2 py-0.5 rounded-full bg-[#F95721]/10 text-[#F95721] text-[10px] font-mono font-bold border border-[#F95721]/20">
            {userRole.toUpperCase()}
          </span>

          {leads.length > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F95721] text-white text-xs font-mono font-bold shadow-sm">
              <span>Lead {activeLeadIndex + 1} of {leads.length}</span>
            </span>
          )}

          {/* Admin/Manager Scope Filter Dropdown */}
          {!impersonatedCaller && (
            <div className="flex items-center gap-1.5 ml-1">
              <span className="text-[10px] font-mono uppercase text-[#6E6B66] dark:text-[#8A8680] font-bold tracking-wider hidden sm:inline">
                Scope:
              </span>
              <div className="relative">
                <select
                  value={queueScope}
                  onChange={(e) => handleScopeChange(e.target.value)}
                  className="text-xs font-semibold py-1 pl-2.5 pr-7 rounded-full bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] text-[#111110] dark:text-[#F5F3EF] hover:border-[#F95721] focus:border-[#F95721] outline-none shadow-sm cursor-pointer transition-colors appearance-none font-mono"
                >
                  <option value="all">All Leads ({totalPoolCount ?? 0})</option>
                  {callersList.map((c) => (
                    <option key={c.id} value={`caller_${c.id}`}>
                      {c.full_name} ({c.lead_count})
                    </option>
                  ))}
                  <option value="unassigned">Unassigned ({unassignedPoolCount})</option>
                </select>
                <ChevronDown className="w-3 h-3 text-[#6E6B66] dark:text-[#8A8680] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2.5">
          {onSwitchToCockpit && (
            <button
              type="button"
              onClick={onSwitchToCockpit}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/5 dark:bg-white/5 hover:bg-[#F95721]/10 text-[#6E6B66] dark:text-[#8A8680] hover:text-[#F95721] border border-[#ECE8E1] dark:border-[#2D2924] font-mono text-xs font-semibold transition-colors"
            >
              <span>📱 Caller View</span>
            </button>
          )}

          {/* Mirror Mode Pill & Popover */}
          {impersonatedCaller && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsMirrorDetailsOpen((prev) => !prev)}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-700 dark:text-amber-400 font-mono text-xs font-semibold shadow-sm transition-all active:scale-95"
                title="Click to view Mirror Mode audit trail & session details"
              >
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
                <span>
                  MIRRORING • {impersonatedCaller.full_name} • {impersonatedCaller.dials_today} dials • {leads.length} leads
                </span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isMirrorDetailsOpen ? "rotate-180" : ""}`} />
              </button>

              {isMirrorDetailsOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 rounded-3xl bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] shadow-2xl p-4 z-[150] animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="flex items-start justify-between pb-2.5 border-b border-[#ECE8E1] dark:border-[#2D2924]">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm">👁️</span>
                      <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#F95721]">
                        Mirror Mode Audit Trail
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsMirrorDetailsOpen(false)}
                      className="p-1 text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF] rounded-lg hover:bg-black/5 dark:hover:bg-white/5"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="py-3 space-y-2.5 text-xs">
                    <div className="p-2.5 rounded-2xl bg-black/5 dark:bg-white/5 space-y-1">
                      <div className="flex items-center justify-between font-mono text-[11px]">
                        <span className="text-[#8A8680]">Caller Status:</span>
                        <span className="inline-flex items-center gap-1 font-bold text-[#111110] dark:text-[#F5F3EF]">
                          <span className={`w-2 h-2 rounded-full ${impersonatedCaller.is_online ? "bg-emerald-500" : "bg-stone-400"}`} />
                          {impersonatedCaller.is_online ? "Active / Online" : "Idle / Offline"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between font-mono text-[11px]">
                        <span className="text-[#8A8680]">Assigned Deck:</span>
                        <span className="font-bold text-[#F95721]">{leads.length} active leads</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      {!currentLead || leads.length === 0 ? (
        <div className="p-8 sm:p-12 text-center bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] rounded-3xl max-w-lg mx-auto shadow-sm space-y-4">
          <div className="w-12 h-12 rounded-full bg-[#F95721]/10 text-[#F95721] flex items-center justify-center mx-auto">
            <CheckCircle className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-[#111110] dark:text-[#F5F3EF]">No Leads in Current Scope</h2>
          <p className="text-xs text-[#6E6B66] dark:text-[#8A8680] max-w-sm mx-auto">
            No active leads matching &ldquo;{activeScopeLabel}&rdquo;. Switch scope to view other queues.
          </p>
          <button
            onClick={() => handleScopeChange("all")}
            className="px-5 py-2.5 bg-[#F95721] hover:bg-[#E04612] text-white rounded-full font-semibold text-xs transition-transform active:scale-95 shadow-sm"
          >
            Switch to All Active Leads ({totalPoolCount})
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Active Lead Hero Card (Left 2 cols) */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] rounded-3xl p-5 sm:p-8 shadow-sm relative overflow-hidden">
              {/* Card Header & Status Badges */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#ECE8E1] dark:border-[#2D2924]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-mono uppercase tracking-wider text-[#F95721] font-bold">
                    Lead #{activeLeadIndex + 1} of {leads.length}
                  </span>

                  {currentLead.assigned_to ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/5 dark:bg-white/5 border border-[#ECE8E1] dark:border-[#2D2924] text-[11px] font-medium text-[#111110] dark:text-[#F5F3EF]">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                        <span>Assigned to:</span>
                        <strong className="text-[#F95721] font-semibold">
                          {currentLead.assigned_to === currentUserId
                            ? "You"
                            : currentLead.profiles?.full_name || "Caller"}
                        </strong>
                      </span>

                      {/* Quick Reassign Dropdown for Managers */}
                      <div className="flex items-center gap-1.5">
                        <select
                          value={currentLead.assigned_to || ""}
                          onChange={(e) => handleReassignLead(currentLead.id, e.target.value)}
                          disabled={isReassigning}
                          className="text-[10px] font-semibold py-1 px-2.5 rounded-full bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] text-[#6E6B66] dark:text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF] hover:border-[#F95721]/50 outline-none cursor-pointer"
                        >
                          <option value={currentLead.assigned_to}>Reassign lead...</option>
                          <option value="">&rarr; Unassign to Pool</option>
                          {callersList.map((c) => (
                            <option key={c.id} value={c.id}>
                              &rarr; {c.full_name} ({c.lead_count} leads)
                            </option>
                          ))}
                        </select>
                        {isReassigning && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#F95721]" />}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[11px] font-bold">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Unassigned Pool</span>
                      </span>

                      <div className="flex items-center gap-1.5">
                        <select
                          defaultValue=""
                          onChange={(e) => handleReassignLead(currentLead.id, e.target.value)}
                          disabled={isReassigning}
                          className="text-[10px] font-semibold py-1 px-2.5 rounded-full bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] text-[#6E6B66] dark:text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF] hover:border-[#F95721]/50 outline-none cursor-pointer"
                        >
                          <option value="" disabled>Assign to caller...</option>
                          {callersList.map((c) => (
                            <option key={c.id} value={c.id}>
                              &rarr; Assign to {c.full_name} ({c.lead_count} leads)
                            </option>
                          ))}
                        </select>
                        {isReassigning && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#F95721]" />}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Lead Details */}
              <div className="space-y-5 pt-5">
                <div>
                  <h2 className="text-2xl sm:text-3xl font-black text-[#111110] dark:text-[#F5F3EF] tracking-tight break-words">
                    {formatLeadName(currentLead.name)}
                  </h2>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-[#F95721]/10 text-[#F95721] border border-[#F95721]/20">
                      {currentLead.niche}
                    </span>
                    <span className="px-3 py-1 rounded-full text-xs font-semibold bg-black/5 dark:bg-white/10 text-[#111110] dark:text-[#F5F3EF] border border-[#ECE8E1] dark:border-[#2D2924]">
                      {currentLead.area}
                    </span>
                    <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-black/5 dark:bg-white/5 text-[#111110] dark:text-[#F5F3EF] border border-[#ECE8E1] dark:border-[#2D2924] flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-[#F95721]" />
                      <span>
                        {(currentLead.attempts_count || 0) === 0
                          ? "Attempt 1/5"
                          : `Attempt ${Math.min(5, currentLead.attempts_count)}/5`}
                      </span>
                    </span>
                    <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#F95721]/10 text-[#F95721] border border-[#F95721]/20 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5" />
                      <span>Ask for: <strong>{resolveDecisionMaker(currentLead)}</strong></span>
                    </span>
                  </div>
                </div>

                {/* Target Phone Number */}
                <div className="p-4 sm:p-5 rounded-2xl bg-[#F95721]/5 dark:bg-[#F95721]/10 border border-[#F95721]/20 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-[#6E6B66] dark:text-[#8A8680] block">
                      Target Phone Number
                    </span>
                    <span className="text-2xl sm:text-3xl font-mono font-black text-[#F95721] tracking-wide select-all block">
                      {formatPhoneDisplay(currentLead.phone)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (currentLead?.phone) {
                        navigator.clipboard.writeText(currentLead.phone);
                        setCopiedPhone(true);
                        setTimeout(() => setCopiedPhone(false), 1500);
                      }
                    }}
                    className="px-3 py-1.5 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-[#6E6B66] dark:text-[#8A8680] text-xs font-semibold inline-flex items-center gap-1.5 transition-colors shrink-0"
                  >
                    {copiedPhone ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-feedback-success" />
                        <span className="text-[11px] text-feedback-success font-medium">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span className="text-[11px] font-medium">Copy</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Action Buttons */}
                <div className="pt-2 flex flex-col sm:flex-row items-center gap-4">
                  {callActive && (
                    <div className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-3 rounded-full bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 font-mono font-bold text-xs animate-pulse">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />
                      <span>Call in progress: {formatDurationTimer(callElapsedSeconds)}</span>
                    </div>
                  )}
                  <a
                    href={formatTelLink(currentLead.phone)}
                    onClick={handleStartCall}
                    className="w-full sm:w-auto flex-1 min-h-[50px] py-4 px-8 bg-[#F95721] hover:bg-[#E04612] text-white font-bold text-sm uppercase tracking-wider rounded-full shadow-lg flex items-center justify-center gap-3 transition-transform active:scale-[0.98] text-center"
                  >
                    <PhoneCall className="w-5 h-5 animate-pulse" />
                    <span>Dial Now ({formatPhoneDisplay(currentLead.phone)})</span>
                  </a>

                  <button
                    onClick={() => setIsDrawerOpen(true)}
                    className="w-full sm:w-auto min-h-[50px] py-4 px-6 bg-white dark:bg-[#1C1A17] hover:bg-black/5 dark:hover:bg-white/5 border border-[#ECE8E1] dark:border-[#2D2924] rounded-full text-xs font-semibold text-[#111110] dark:text-[#F5F3EF] transition-colors flex items-center justify-center gap-2"
                  >
                    <span>Log Outcome</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Embedded Comments Thread / Coaching Notes */}
            <div className="bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] rounded-3xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[#ECE8E1] dark:border-[#2D2924]">
                <div className="flex items-center gap-2">
                  <span className="text-base">📝</span>
                  <span className="text-xs font-bold uppercase tracking-wider font-mono text-[#F95721]">
                    Internal Notes & Discussion
                  </span>
                </div>
              </div>
              <EntityComments entityType="lead" entityId={currentLead.id} />
            </div>
          </div>

          {/* Up Next Queue Deck (Right 1 col) */}
          <div className="bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] rounded-3xl p-6 shadow-sm flex flex-col h-[600px] lg:h-[680px]">
            <div className="flex items-center justify-between pb-4 border-b border-[#ECE8E1] dark:border-[#2D2924]">
              <span className="text-xs font-bold uppercase tracking-wider text-[#111110] dark:text-[#F5F3EF] font-mono">
                Deck Queue
              </span>
              <span className="text-xs font-mono font-semibold text-[#F95721]">
                {leads.length} leads
              </span>
            </div>

            {/* Leads List */}
            <div className="flex-1 overflow-y-auto divide-y divide-[#ECE8E1]/60 dark:divide-[#2D2924]/60 mt-2 pr-1">
              {leads.map((lead, idx) => (
                <button
                  key={lead.id}
                  onClick={() => setActiveLeadIndex(idx)}
                  className={`w-full text-left p-3.5 rounded-2xl transition-all flex items-center justify-between gap-3 ${
                    idx === activeLeadIndex
                      ? "bg-[#F95721]/10 border border-[#F95721]/30 font-semibold"
                      : "hover:bg-black/5 dark:hover:bg-white/5"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p
                      className="text-xs text-[#111110] dark:text-[#F5F3EF] font-bold line-clamp-2 leading-snug break-words"
                      title={formatLeadName(lead.name)}
                    >
                      {formatLeadName(lead.name)}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      <span className="text-[10px] text-[#6E6B66] dark:text-[#8A8680] truncate">
                        {lead.niche} • {lead.area}
                      </span>
                      <span className="text-[10px] text-[#6E6B66] dark:text-[#8A8680]">•</span>
                      {lead.assigned_to ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[#F95721]/10 text-[#F95721] font-mono text-[9px] font-bold">
                          <User className="w-2.5 h-2.5" />
                          <span>{lead.profiles?.full_name || "Caller"}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-mono text-[9px] font-bold">
                          Unassigned
                        </span>
                      )}
                    </div>
                  </div>

                  <ChevronRight className="w-4 h-4 text-[#6E6B66] dark:text-[#8A8680] shrink-0 opacity-40" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
