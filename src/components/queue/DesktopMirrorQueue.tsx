"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  X,
  Lock,
  Phone,
  User,
  MapPin,
  Globe,
  ExternalLink,
  Clock,
  ChevronRight,
  Copy,
  Check,
  FileText,
  Loader2,
  Sparkles,
  PhoneCall,
  CalendarClock,
  ShieldAlert,
  Flame,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export interface Lead {
  id: string;
  name: string;
  phone: string;
  normalized_phone?: string;
  website: string | null;
  has_website?: boolean;
  address: string | null;
  niche: string;
  area: string;
  score?: number;
  status: string;
  assigned_to: string | null;
  attempts_count: number;
  next_callback_at: string | null;
  last_called_at: string | null;
  decision_maker?: string | null;
  cooldown_until?: string | null;
  rejection_reason?: string | null;
  profiles?: {
    full_name: string;
  } | null;
}

export type DoneLead = Lead & {
  callId?: string;
  callOutcome?: string;
  callCalledAt?: string;
  callNotes?: string | null;
  callDuration?: number | null;
};

export type PipelineTab = "dial_now" | "callbacks" | "waiting" | "done";

export interface HistoricalCallLog {
  id: string;
  notes: string | null;
  outcome: string;
  duration_seconds: number | null;
  called_at: string;
  caller_name: string;
}

interface CallerProfile {
  id: string;
  full_name: string;
  role: string;
}

interface PipelineCounts {
  dialNow: number;
  callbacks: number;
  overdueCallbacks: number;
  waiting: number;
  done: number;
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

function formatLeadName(name: string | null | undefined): string {
  if (!name) return "Unnamed Clinic";
  let cleaned = name.trim().replace(/([a-zA-Z0-9'’])\s*-\s*([a-zA-Z0-9])/g, "$1 - $2");
  cleaned = cleaned.replace(/\bDr\.([A-Za-z])/gi, "Dr. $1");
  cleaned = cleaned.replace(/\bDr(?!\.)\s+/gi, "Dr. ");
  return cleaned.replace(/\s+/g, " ").trim();
}

function resolveDecisionMaker(lead: Lead | null): string {
  if (!lead) return "Ask for the owner";
  if (lead.decision_maker && lead.decision_maker.trim()) {
    return lead.decision_maker.trim();
  }
  const match = (lead.name || "").match(/^(Dr\.?\s*[A-Za-z]+('s)?)/i);
  if (match) {
    const docName = match[1].replace(/'s$/i, "").replace(/^Dr\.?/i, "Dr. ");
    return `${docName.trim()} (Owner)`;
  }
  return "Ask for the owner";
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

function getOutcomeBadge(outcome: string) {
  const norm = (outcome || "").toLowerCase();
  switch (norm) {
    case "interested":
      return {
        icon: Flame,
        label: "Interested",
        color: "text-rose-400 bg-rose-500/10 border-rose-500/20",
      };
    case "callback":
      return {
        icon: CalendarClock,
        label: "Callback",
        color: "text-amber-400 bg-amber-500/10 border-amber-500/20",
      };
    case "no_answer":
      return {
        icon: Clock,
        label: "No Answer",
        color: "text-zinc-400 bg-zinc-800 border-zinc-700",
      };
    case "gatekeeper":
      return {
        icon: ShieldAlert,
        label: "Gatekeeper",
        color: "text-blue-400 bg-blue-500/10 border-blue-500/20",
      };
    case "not_interested":
    case "rejected":
      return {
        icon: XCircle,
        label: "Rejected",
        color: "text-zinc-500 bg-zinc-900 border-zinc-800",
      };
    default:
      return {
        icon: PhoneCall,
        label: norm.replace("_", " ") || "Call",
        color: "text-zinc-400 bg-zinc-800 border-zinc-700",
      };
  }
}

export function DesktopMirrorQueue({ callerId }: { callerId: string }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [caller, setCaller] = useState<CallerProfile | null>(null);
  const [activeTab, setActiveTab] = useState<PipelineTab>("dial_now");

  // Partitioned buckets
  const [readyLeads, setReadyLeads] = useState<Lead[]>([]);
  const [callbackLeads, setCallbackLeads] = useState<Lead[]>([]);
  const [waitingLeads, setWaitingLeads] = useState<Lead[]>([]);
  const [doneLeads, setDoneLeads] = useState<DoneLead[]>([]);

  const [activeLeadIndex, setActiveLeadIndex] = useState(0);
  const [pipeline, setPipeline] = useState<PipelineCounts>({
    dialNow: 0,
    callbacks: 0,
    overdueCallbacks: 0,
    waiting: 0,
    done: 0,
  });
  const [loading, setLoading] = useState(true);
  const [copiedPhone, setCopiedPhone] = useState(false);

  // Latest call log for current lead (for dial_now / callbacks / waiting)
  const [latestCall, setLatestCall] = useState<{
    outcome: string;
    called_at: string;
    caller_name: string;
    notes: string | null;
  } | null>(null);
  const [loadingCall, setLoadingCall] = useState(false);

  // Dossier modal state
  const [isDossierOpen, setIsDossierOpen] = useState(false);
  const [dossierLogs, setDossierLogs] = useState<HistoricalCallLog[]>([]);
  const [loadingDossier, setLoadingDossier] = useState(false);

  // Active bucket derived from the currently selected pipeline tab
  const currentBucket = useMemo(() => {
    switch (activeTab) {
      case "dial_now":
        return readyLeads;
      case "callbacks":
        return callbackLeads;
      case "waiting":
        return waitingLeads;
      case "done":
        return doneLeads;
      default:
        return readyLeads;
    }
  }, [activeTab, readyLeads, callbackLeads, waitingLeads, doneLeads]);

  const currentLead = currentBucket[activeLeadIndex] || null;

  // 1. Fetch Caller Profile, Leads, and Pipeline Partition
  const loadMirrorData = useCallback(async () => {
    setLoading(true);
    try {
      // Caller Profile
      const { data: callerData } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .eq("id", callerId)
        .maybeSingle();

      if (callerData) {
        setCaller(callerData);
      }

      // Fetch all assigned active leads for this caller
      const { data: leadsData, error: leadsErr } = await supabase
        .from("leads")
        .select("*, profiles:assigned_to(full_name)")
        .eq("assigned_to", callerId)
        .is("deleted_at", null)
        .not("status", "in", '("closed_won","closed_lost","dnc","not_interested","interested")')
        .order("next_callback_at", { ascending: true, nullsFirst: false })
        .order("score", { ascending: false });

      if (leadsErr) throw leadsErr;

      const rawLeads: Lead[] = leadsData || [];

      // Partition into the 3 active pipeline buckets
      const now = new Date();
      let overdueCallbackCount = 0;
      const readyBucket: Lead[] = [];
      const callbackBucket: Lead[] = [];
      const cooldownBucket: Lead[] = [];

      rawLeads.forEach((lead) => {
        const isCallback = lead.status === "callback" || Boolean(lead.next_callback_at);
        const isCooldown = lead.cooldown_until && new Date(lead.cooldown_until) > now;

        if (isCallback) {
          if (lead.next_callback_at && new Date(lead.next_callback_at) <= now) {
            overdueCallbackCount++;
          }
          callbackBucket.push(lead);
        } else if (isCooldown) {
          cooldownBucket.push(lead);
        } else {
          readyBucket.push(lead);
        }
      });

      // 2. Fetch calls completed today by this caller (IST Day Start: UTC+5:30)
      const istOffsetMs = 5.5 * 60 * 60 * 1000;
      const istNow = new Date(Date.now() + istOffsetMs);
      const istDateStr = istNow.toISOString().split("T")[0];
      const istStartUtc = new Date(
        new Date(`${istDateStr}T00:00:00.000Z`).getTime() - istOffsetMs
      ).toISOString();

      const { data: todayCallsData } = await supabase
        .from("calls")
        .select("id, lead_id, outcome, duration_seconds, notes, called_at, callback_at")
        .eq("caller_id", callerId)
        .gte("called_at", istStartUtc)
        .order("called_at", { ascending: false });

      const todayCalls = todayCallsData || [];
      const doneLeadIds = Array.from(
        new Set(todayCalls.map((c) => c.lead_id).filter(Boolean))
      ) as string[];

      // Resolve any leads that are in today's calls but not in rawLeads (e.g. closed/quarantined today)
      const missingLeadIds = doneLeadIds.filter(
        (id) => !rawLeads.some((l) => l.id === id)
      );

      let fetchedMissing: Lead[] = [];
      if (missingLeadIds.length > 0) {
        const { data: missingData } = await supabase
          .from("leads")
          .select("*, profiles:assigned_to(full_name)")
          .in("id", missingLeadIds);
        if (missingData) {
          fetchedMissing = missingData;
        }
      }

      const allLeadsMap = new Map<string, Lead>();
      rawLeads.forEach((l) => allLeadsMap.set(l.id, l));
      fetchedMissing.forEach((l) => allLeadsMap.set(l.id, l));

      const doneBucket: DoneLead[] = [];
      todayCalls.forEach((call) => {
        const baseLead = call.lead_id ? allLeadsMap.get(call.lead_id) : null;
        if (baseLead) {
          doneBucket.push({
            ...baseLead,
            callId: call.id,
            callOutcome: call.outcome,
            callCalledAt: call.called_at,
            callNotes: call.notes,
            callDuration: call.duration_seconds,
          });
        }
      });

      setReadyLeads(readyBucket);
      setCallbackLeads(callbackBucket);
      setWaitingLeads(cooldownBucket);
      setDoneLeads(doneBucket);

      setPipeline({
        dialNow: readyBucket.length,
        callbacks: callbackBucket.length,
        overdueCallbacks: overdueCallbackCount,
        waiting: cooldownBucket.length,
        done: doneBucket.length,
      });
    } catch (err) {
      console.error("Failed to load desktop mirror data:", err);
    } finally {
      setLoading(false);
    }
  }, [callerId, supabase]);

  useEffect(() => {
    loadMirrorData();
  }, [loadMirrorData]);

  // Handle Tab Change: switches filtered queue deck and resets lead selection to first item
  const handleTabChange = (tab: PipelineTab) => {
    setActiveTab(tab);
    setActiveLeadIndex(0);
  };

  // 2. Fetch Latest Call Log for Current Lead
  useEffect(() => {
    if (!currentLead) {
      setLatestCall(null);
      return;
    }

    let isMounted = true;
    setLoadingCall(true);

    async function fetchLatestCall() {
      try {
        const { data: callData } = await supabase
          .from("calls")
          .select("outcome, called_at, notes, caller:caller_id(full_name)")
          .eq("lead_id", currentLead.id)
          .order("called_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (isMounted) {
          if (callData) {
            const callerName =
              (callData.caller as any)?.full_name || caller?.full_name || "Caller";
            setLatestCall({
              outcome: callData.outcome,
              called_at: callData.called_at,
              caller_name: callerName,
              notes: callData.notes,
            });
          } else {
            setLatestCall(null);
          }
        }
      } catch (err) {
        console.warn("Could not fetch latest call for lead:", err);
      } finally {
        if (isMounted) setLoadingCall(false);
      }
    }

    fetchLatestCall();

    return () => {
      isMounted = false;
    };
  }, [currentLead?.id, caller?.full_name, supabase]);

  // 3. Fetch Historical Call Logs for Dossier Modal
  const openDossier = useCallback(async () => {
    if (!currentLead) return;
    setIsDossierOpen(true);
    setLoadingDossier(true);
    try {
      const { data: logsData } = await supabase
        .from("calls")
        .select("id, outcome, duration_seconds, called_at, notes, caller:caller_id(full_name)")
        .eq("lead_id", currentLead.id)
        .order("called_at", { ascending: false });

      const logs: HistoricalCallLog[] = (logsData || []).map((l: any) => ({
        id: l.id,
        notes: l.notes,
        outcome: l.outcome,
        duration_seconds: l.duration_seconds,
        called_at: l.called_at,
        caller_name: l.caller?.full_name || caller?.full_name || "Caller",
      }));

      setDossierLogs(logs);
    } catch (err) {
      console.warn("Could not load dossier logs:", err);
    } finally {
      setLoadingDossier(false);
    }
  }, [currentLead?.id, caller?.full_name, supabase]);

  // Exit Mirror Mode: route back to Team Command Center
  const handleExitMirror = () => {
    router.push("/studio/manager/team");
  };

  // Copy phone helper
  function copyPhoneNumber(phone: string) {
    if (!phone) return;
    navigator.clipboard.writeText(phone);
    setCopiedPhone(true);
    setTimeout(() => setCopiedPhone(false), 2000);
  }

  const callerDisplayName = caller?.full_name || "Caller";

  return (
    <div className="min-h-screen bg-[#F7F5F0] dark:bg-[#141210] text-[#111110] dark:text-[#F5F3EF] flex flex-col transition-colors selection:bg-[#F95721]/20">
      {/* 1. STICKY TOP BANNER (Full width, amber background, high contrast) */}
      <div className="w-full sticky top-0 z-50 bg-[#F59E0B]/15 border-b border-[#F59E0B]/30 backdrop-blur-md px-4 sm:px-8 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 text-[#F59E0B] shrink-0" />
          <span className="font-mono text-xs uppercase tracking-wider font-extrabold text-[#F59E0B]">
            ⚠️ MIRRORING: {callerDisplayName} (READ-ONLY)
          </span>
          <span className="hidden md:inline-block text-[11px] text-[#A8A29E] font-medium ml-2">
            Observing live operator queue session
          </span>
        </div>

        <button
          type="button"
          onClick={handleExitMirror}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#F59E0B]/20 hover:bg-[#F59E0B]/30 text-[#F59E0B] hover:text-[#FBBF24] text-xs font-semibold rounded-lg border border-[#F59E0B]/40 transition active:scale-95 shadow-sm"
        >
          <span>Exit Mirror</span>
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 2. TODAY'S PIPELINE TABS STRIP (Clickable tabs, quiet, active orange underline, no boxes around numbers) */}
      <div className="w-full bg-white dark:bg-[#181614] border-b border-[#ECE8E1] dark:border-[#2D2924] px-4 sm:px-8 flex items-center justify-between overflow-x-auto text-xs">
        <div className="flex items-center gap-6 sm:gap-8 font-mono shrink-0">
          {/* Tab 1: Dial Now */}
          <button
            type="button"
            onClick={() => handleTabChange("dial_now")}
            className={`py-3 flex items-center gap-2 border-b-2 text-xs font-semibold transition-all relative ${
              activeTab === "dial_now"
                ? "border-[#F95721] text-[#111110] dark:text-[#F5F3EF]"
                : "border-transparent text-[#6E6B66] dark:text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF]"
            }`}
          >
            <span>Dial Now</span>
            <span
              className={
                activeTab === "dial_now"
                  ? "text-[#F95721] font-bold"
                  : "text-[#6E6B66] dark:text-[#8A8680]"
              }
            >
              {pipeline.dialNow}
            </span>
          </button>

          {/* Tab 2: Callbacks */}
          <button
            type="button"
            onClick={() => handleTabChange("callbacks")}
            className={`py-3 flex items-center gap-2 border-b-2 text-xs font-semibold transition-all relative ${
              activeTab === "callbacks"
                ? "border-[#F95721] text-[#111110] dark:text-[#F5F3EF]"
                : "border-transparent text-[#6E6B66] dark:text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF]"
            }`}
          >
            <span>Callbacks</span>
            <span
              className={
                activeTab === "callbacks"
                  ? "text-[#F95721] font-bold"
                  : "text-[#6E6B66] dark:text-[#8A8680]"
              }
            >
              {pipeline.callbacks}
              {pipeline.overdueCallbacks > 0 && (
                <span className="text-rose-500 font-semibold ml-1">
                  ({pipeline.overdueCallbacks} overdue)
                </span>
              )}
            </span>
          </button>

          {/* Tab 3: Waiting */}
          <button
            type="button"
            onClick={() => handleTabChange("waiting")}
            className={`py-3 flex items-center gap-2 border-b-2 text-xs font-semibold transition-all relative ${
              activeTab === "waiting"
                ? "border-[#F95721] text-[#111110] dark:text-[#F5F3EF]"
                : "border-transparent text-[#6E6B66] dark:text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF]"
            }`}
          >
            <span>Waiting</span>
            <span
              className={
                activeTab === "waiting"
                  ? "text-[#F95721] font-bold"
                  : "text-[#6E6B66] dark:text-[#8A8680]"
              }
            >
              {pipeline.waiting}
            </span>
          </button>

          {/* Tab 4: Done */}
          <button
            type="button"
            onClick={() => handleTabChange("done")}
            className={`py-3 flex items-center gap-2 border-b-2 text-xs font-semibold transition-all relative ${
              activeTab === "done"
                ? "border-[#F95721] text-[#111110] dark:text-[#F5F3EF]"
                : "border-transparent text-[#6E6B66] dark:text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF]"
            }`}
          >
            <span>Done</span>
            <span
              className={
                activeTab === "done"
                  ? "text-[#F95721] font-bold"
                  : "text-[#6E6B66] dark:text-[#8A8680]"
              }
            >
              {pipeline.done}
            </span>
          </button>
        </div>

        <div className="hidden lg:flex items-center gap-2 text-[11px] text-[#6E6B66] dark:text-[#8A8680]">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Synced with {callerDisplayName}&apos;s live mobile queue</span>
        </div>
      </div>

      {/* 3. MAIN CONTENT — TWO COLUMNS (Desktop-native) */}
      <div className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-8 py-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-[#F95721]" />
            <p className="text-xs font-mono text-[#8A8680]">
              Loading {callerDisplayName}&apos;s queue stream...
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* LEFT COLUMN (60%): CURRENT LEAD CARD OR STATE EMPTY VIEW */}
            {currentBucket.length === 0 ? (
              <div className="lg:col-span-7 bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] rounded-2xl p-8 sm:p-12 shadow-sm flex flex-col items-center justify-center text-center space-y-3 min-h-[420px]">
                {activeTab === "dial_now" ? (
                  <>
                    <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                    <h3 className="text-base font-bold text-[#111110] dark:text-[#F5F3EF]">
                      No Ready Leads to Dial
                    </h3>
                    <p className="text-xs text-[#8A8680] max-w-sm">
                      {callerDisplayName} has zero fresh leads in their ready dial deck right now.
                    </p>
                    {callbackLeads.length > 0 && (
                      <button
                        type="button"
                        onClick={() => handleTabChange("callbacks")}
                        className="mt-3 px-3.5 py-1.5 rounded-xl bg-amber-500/10 text-amber-500 border border-amber-500/20 text-xs font-semibold hover:bg-amber-500/20 transition"
                      >
                        View Scheduled Callbacks ({callbackLeads.length})
                      </button>
                    )}
                  </>
                ) : activeTab === "callbacks" ? (
                  <>
                    <CalendarClock className="w-10 h-10 text-amber-400" />
                    <h3 className="text-base font-bold text-[#111110] dark:text-[#F5F3EF]">
                      No Scheduled Callbacks
                    </h3>
                    <p className="text-xs text-[#8A8680] max-w-sm">
                      {callerDisplayName} has no pending or upcoming scheduled callbacks.
                    </p>
                  </>
                ) : activeTab === "waiting" ? (
                  <>
                    <Clock className="w-10 h-10 text-zinc-400" />
                    <h3 className="text-base font-bold text-[#111110] dark:text-[#F5F3EF]">
                      No Leads in Cooldown
                    </h3>
                    <p className="text-xs text-[#8A8680] max-w-sm">
                      No leads are currently cooling down for {callerDisplayName}.
                    </p>
                  </>
                ) : (
                  <>
                    <PhoneCall className="w-10 h-10 text-emerald-500" />
                    <h3 className="text-base font-bold text-[#111110] dark:text-[#F5F3EF]">
                      No Calls Completed Today
                    </h3>
                    <p className="text-xs text-[#8A8680] max-w-sm">
                      {callerDisplayName} has not logged any calls yet during today&apos;s shift.
                    </p>
                  </>
                )}
              </div>
            ) : currentLead ? (
              <div className="lg:col-span-7 bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] rounded-2xl p-6 sm:p-8 shadow-sm flex flex-col justify-between space-y-6">
                {/* Lead Sequence & Target Decision Maker Header */}
                <div>
                  <div className="flex items-center justify-between text-xs font-mono text-[#8A8680] mb-2">
                    <span>
                      {activeTab === "done" ? "CALL" : "LEAD"} {activeLeadIndex + 1} OF{" "}
                      {currentBucket.length}
                    </span>
                    <span className="flex items-center gap-1.5 text-zinc-400">
                      <User className="w-3.5 h-3.5" />
                      Assigned: {callerDisplayName}
                    </span>
                  </div>

                  {/* Business Name (Large) */}
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-[#111110] dark:text-[#F5F3EF] tracking-tight leading-tight">
                    {formatLeadName(currentLead.name)}
                  </h1>

                  {/* Badges: Niche · Area · Attempt X/5 */}
                  <div className="flex flex-wrap items-center gap-2 pt-3">
                    <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-black/5 dark:bg-white/5 border border-[#ECE8E1] dark:border-[#2D2924] text-[#111110] dark:text-[#F5F3EF]">
                      {currentLead.niche}
                    </span>
                    <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-black/5 dark:bg-white/5 border border-[#ECE8E1] dark:border-[#2D2924] text-[#8A8680]">
                      {currentLead.area}
                    </span>
                    <span className="px-2.5 py-1 rounded-lg text-xs font-mono font-semibold bg-[#F95721]/10 text-[#F95721] border border-[#F95721]/20">
                      Attempt {currentLead.attempts_count || 1}/5
                    </span>
                    {currentLead.score && (
                      <span className="px-2.5 py-1 rounded-lg text-xs font-mono text-zinc-400 bg-black/5 dark:bg-white/5 border border-[#ECE8E1] dark:border-[#2D2924]">
                        Score: {currentLead.score}
                      </span>
                    )}
                  </div>
                </div>

                {/* Decision Maker Card */}
                <div className="p-4 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-[#ECE8E1] dark:border-[#2D2924] flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#F95721]/10 flex items-center justify-center text-[#F95721] shrink-0">
                    <User className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-[10px] uppercase font-mono tracking-wider text-[#8A8680] block">
                      Decision Maker
                    </span>
                    <span className="text-xs font-bold text-[#111110] dark:text-[#F5F3EF]">
                      {resolveDecisionMaker(currentLead)}
                    </span>
                  </div>
                </div>

                {/* Last Contact Strip (Prior Outcome + Caller + Date) */}
                <div className="p-3.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-[#ECE8E1] dark:border-[#2D2924] flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-zinc-800 flex items-center justify-center text-zinc-400 shrink-0">
                      <Clock className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-mono tracking-wider text-[#8A8680] block">
                        {activeTab === "done" ? "Call Outcome Today" : "Prior Contact Status"}
                      </span>
                      {activeTab === "done" && (currentLead as DoneLead).callOutcome ? (
                        <span className="font-medium text-[#111110] dark:text-[#F5F3EF]">
                          Logged today:{" "}
                          <span className="text-amber-400 font-semibold capitalize">
                            {(currentLead as DoneLead).callOutcome?.replace("_", " ")}
                          </span>{" "}
                          · {callerDisplayName} ·{" "}
                          {formatRelativeTime((currentLead as DoneLead).callCalledAt)}
                        </span>
                      ) : loadingCall ? (
                        <span className="text-zinc-400">Loading prior contact...</span>
                      ) : latestCall ? (
                        <span className="font-medium text-[#111110] dark:text-[#F5F3EF]">
                          Last contact:{" "}
                          <span className="text-amber-400 font-semibold capitalize">
                            {latestCall.outcome.replace("_", " ")}
                          </span>{" "}
                          · {latestCall.caller_name} · {formatRelativeTime(latestCall.called_at)}
                        </span>
                      ) : (
                        <span className="font-medium text-emerald-500 flex items-center gap-1">
                          <Sparkles className="w-3 h-3" />
                          Fresh Lead · No prior dial attempts
                        </span>
                      )}
                    </div>
                  </div>

                  {((activeTab === "done"
                    ? (currentLead as DoneLead).callNotes
                    : latestCall?.notes)) && (
                    <span
                      className="text-[11px] text-[#8A8680] max-w-[200px] truncate italic hidden sm:inline"
                      title={
                        ((activeTab === "done"
                          ? (currentLead as DoneLead).callNotes
                          : latestCall?.notes)) || ""
                      }
                    >
                      &ldquo;
                      {activeTab === "done"
                        ? (currentLead as DoneLead).callNotes
                        : latestCall?.notes}
                      &rdquo;
                    </span>
                  )}
                </div>

                {/* Target Primary Phone Line (Large typography) */}
                <div className="p-4 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-[#ECE8E1] dark:border-[#2D2924] flex items-center justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-mono tracking-wider text-[#8A8680] block">
                      Target Primary Line
                    </span>
                    <span className="text-xl sm:text-2xl font-mono font-bold tracking-tight text-[#111110] dark:text-[#F5F3EF]">
                      {formatPhoneDisplay(currentLead.phone)}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => copyPhoneNumber(currentLead.phone)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-xs font-semibold text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF] transition active:scale-95 border border-[#ECE8E1] dark:border-[#2D2924]"
                    title="Copy phone number"
                  >
                    {copiedPhone ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                        <span className="text-emerald-500">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Physical Location & Website */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-[#ECE8E1] dark:border-[#2D2924] space-y-1">
                    <span className="text-[10px] uppercase font-mono text-[#8A8680] block flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      Physical Address
                    </span>
                    <p className="text-[#6E6B66] dark:text-[#8A8680] line-clamp-2 leading-relaxed">
                      {currentLead?.address || `${currentLead?.area}, Pune`}
                    </p>
                  </div>

                  <div className="p-3 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-[#ECE8E1] dark:border-[#2D2924] space-y-1">
                    <span className="text-[10px] uppercase font-mono text-[#8A8680] block flex items-center gap-1">
                      <Globe className="w-3 h-3" />
                      Digital Footprint
                    </span>
                    {currentLead?.website ? (
                      <a
                        href={
                          currentLead.website.startsWith("http")
                            ? currentLead.website
                            : `https://${currentLead.website}`
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#F95721] hover:underline font-medium inline-flex items-center gap-1 truncate max-w-full"
                      >
                        <span className="truncate">{currentLead.website}</span>
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                    ) : (
                      <span className="text-amber-500/90 font-medium">
                        No official website (Pitch Needed)
                      </span>
                    )}
                  </div>
                </div>

                {/* Call-to-Actions (Disabled Dial + Enabled Dossier) */}
                <div className="space-y-3 pt-2">
                  {/* 🔒 DIAL DISABLED (READ-ONLY) */}
                  <div className="w-full py-3.5 px-4 rounded-xl bg-zinc-800/60 dark:bg-zinc-900 border border-zinc-700/50 text-zinc-400 font-mono text-xs uppercase tracking-wider font-bold flex items-center justify-center gap-2 cursor-not-allowed select-none shadow-sm">
                    <Lock className="w-4 h-4 text-zinc-500" />
                    <span>🔒 DIAL DISABLED (READ-ONLY)</span>
                  </div>

                  {/* View Dossier › Link (ENABLED) */}
                  <button
                    type="button"
                    onClick={openDossier}
                    className="w-full py-2.5 px-4 bg-transparent hover:bg-black/5 dark:hover:bg-white/5 border border-[#ECE8E1] dark:border-[#2D2924] text-[#111110] dark:text-[#F5F3EF] hover:text-[#F95721] text-xs font-semibold rounded-xl flex items-center justify-center gap-1.5 transition active:scale-95"
                  >
                    <FileText className="w-4 h-4 text-[#F95721]" />
                    <span>View Dossier & Historical Audit ›</span>
                  </button>
                </div>
              </div>
            ) : null}

            {/* RIGHT COLUMN (40%): DECK QUEUE SIDEBAR (Filtered to active state) */}
            <div className="lg:col-span-5 bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] rounded-2xl p-5 shadow-sm flex flex-col h-[calc(100vh-180px)] sticky top-24">
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-[#ECE8E1] dark:border-[#2D2924] shrink-0">
                <div>
                  <h2 className="text-xs font-mono uppercase tracking-wider font-bold text-[#111110] dark:text-[#F5F3EF]">
                    DECK QUEUE
                  </h2>
                  <p className="text-[11px] text-[#8A8680] mt-0.5">
                    {activeTab === "dial_now"
                      ? `Ready to dial (${readyLeads.length})`
                      : activeTab === "callbacks"
                      ? `Scheduled callbacks (${callbackLeads.length})`
                      : activeTab === "waiting"
                      ? `In cooldown (${waitingLeads.length})`
                      : `Completed today (${doneLeads.length})`}
                  </p>
                </div>
                <span className="px-2 py-0.5 rounded-lg text-xs font-mono font-bold bg-[#F95721]/10 text-[#F95721] border border-[#F95721]/20">
                  {currentBucket.length} {activeTab === "done" ? "calls" : "leads"}
                </span>
              </div>

              {/* Scrollable List */}
              <div className="flex-1 overflow-y-auto space-y-2 pt-3 pr-1">
                {currentBucket.length === 0 ? (
                  <div className="py-12 text-center text-[#8A8680] space-y-1">
                    <p className="text-xs font-medium">No {activeTab.replace("_", " ")} items</p>
                    <p className="text-[11px] text-[#8A8680]/70">
                      The queue has zero leads in this state.
                    </p>
                  </div>
                ) : (
                  currentBucket.map((lead: any, idx) => {
                    const isActive = idx === activeLeadIndex;
                    const isDoneTab = activeTab === "done";
                    const outcomeBadge = isDoneTab
                      ? getOutcomeBadge(lead.callOutcome || lead.status)
                      : null;
                    const OutcomeIcon = outcomeBadge ? outcomeBadge.icon : null;
                    const isCallback =
                      !isDoneTab &&
                      (lead.status === "callback" || Boolean(lead.next_callback_at));
                    const isOverdue =
                      isCallback &&
                      lead.next_callback_at &&
                      new Date(lead.next_callback_at) <= new Date();
                    const isCooldown =
                      !isDoneTab &&
                      lead.cooldown_until &&
                      new Date(lead.cooldown_until) > new Date();

                    return (
                      <button
                        key={isDoneTab ? `${lead.id}-${lead.callId || idx}` : lead.id}
                        type="button"
                        onClick={() => setActiveLeadIndex(idx)}
                        className={`w-full text-left p-3.5 rounded-xl border transition-all flex items-start justify-between gap-3 ${
                          isActive
                            ? "bg-[#F95721]/10 border-[#F95721]/50 shadow-sm"
                            : "bg-black/[0.02] dark:bg-white/[0.02] border-[#ECE8E1] dark:border-[#2D2924] hover:bg-black/[0.04] dark:hover:bg-white/[0.04]"
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span
                              className={`text-xs font-mono font-bold ${
                                isActive ? "text-[#F95721]" : "text-[#8A8680]"
                              }`}
                            >
                              #{idx + 1}
                            </span>
                            <h3
                              className={`text-xs font-bold truncate ${
                                isActive
                                  ? "text-[#F95721]"
                                  : "text-[#111110] dark:text-[#F5F3EF]"
                              }`}
                            >
                              {formatLeadName(lead.name)}
                            </h3>
                          </div>

                          <div className="flex items-center gap-1.5 text-[11px] text-[#8A8680] truncate">
                            <span>{lead.niche}</span>
                            <span>·</span>
                            <span className="truncate">{lead.area}</span>
                          </div>

                          {isDoneTab && lead.callCalledAt && (
                            <div className="text-[10px] text-[#8A8680] font-mono mt-1">
                              {formatRelativeTime(lead.callCalledAt)}
                              {lead.callDuration
                                ? ` · ${Math.floor(lead.callDuration / 60)}m ${
                                    lead.callDuration % 60
                                  }s`
                                : ""}
                            </div>
                          )}

                          {isCallback && lead.next_callback_at && (
                            <div className="text-[10px] text-amber-400 font-mono mt-1 flex items-center gap-1">
                              <CalendarClock className="w-3 h-3 shrink-0" />
                              <span>
                                {new Date(lead.next_callback_at).toLocaleDateString("en-IN", {
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-[#8A8680]">
                            Att. {lead.attempts_count || 1}/5
                          </span>
                          {isDoneTab && outcomeBadge && OutcomeIcon ? (
                            <span
                              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border inline-flex items-center gap-1 ${outcomeBadge.color}`}
                            >
                              <OutcomeIcon className="w-2.5 h-2.5" />
                              {outcomeBadge.label}
                            </span>
                          ) : isCallback ? (
                            <span
                              className={`text-[10px] font-semibold ${
                                isOverdue ? "text-rose-400" : "text-amber-400"
                              }`}
                            >
                              {isOverdue ? "Overdue" : "Callback"}
                            </span>
                          ) : isCooldown ? (
                            <span className="text-[10px] font-semibold text-zinc-500">
                              Waiting
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold text-emerald-500">
                              Ready
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 4. LEAD DOSSIER MODAL (Enabled, read-only inspection) */}
      {isDossierOpen && currentLead && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in-50 zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-[#ECE8E1] dark:border-[#2D2924] flex items-center justify-between">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-[#F95721] font-bold">
                  Lead Dossier & Audit
                </span>
                <h3 className="text-lg font-bold text-[#111110] dark:text-[#F5F3EF]">
                  {formatLeadName(currentLead.name)}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsDossierOpen(false)}
                className="w-8 h-8 rounded-lg bg-black/5 dark:bg-white/5 flex items-center justify-center text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF] transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
              {/* Metadata Overview */}
              <div className="p-4 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-[#ECE8E1] dark:border-[#2D2924] space-y-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-[#8A8680] block font-bold">
                  Entity Details
                </span>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-[#8A8680] block text-[11px]">Primary Phone</span>
                    <span className="font-mono font-bold">
                      {formatPhoneDisplay(currentLead.phone)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#8A8680] block text-[11px]">Decision Maker</span>
                    <span className="font-semibold">{resolveDecisionMaker(currentLead)}</span>
                  </div>
                  <div>
                    <span className="text-[#8A8680] block text-[11px]">Niche / Area</span>
                    <span>
                      {currentLead.niche} · {currentLead.area}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#8A8680] block text-[11px]">Lead Score</span>
                    <span className="font-mono font-bold text-[#F95721]">
                      {currentLead.score || 75}/100
                    </span>
                  </div>
                </div>
              </div>

              {/* Physical Address */}
              <div className="p-4 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-[#ECE8E1] dark:border-[#2D2924] space-y-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-[#8A8680] block font-bold flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-[#F95721]" />
                  Physical Address
                </span>
                <p className="text-[#6E6B66] dark:text-[#8A8680] leading-relaxed">
                  {currentLead.address || `${currentLead.area}, Pune`}
                </p>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                    `${currentLead.name} ${currentLead.address || currentLead.area || ""}`
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-[#F95721] font-semibold hover:underline pt-1"
                >
                  <span>Open in Google Maps</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>

              {/* Call History Ledger */}
              <div className="p-4 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-[#ECE8E1] dark:border-[#2D2924] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[#8A8680] font-bold">
                    Historical Audit Thread ({dossierLogs.length})
                  </span>
                </div>

                {loadingDossier ? (
                  <div className="py-6 flex items-center justify-center gap-2 text-[#8A8680]">
                    <Loader2 className="w-4 h-4 animate-spin text-[#F95721]" />
                    <span>Loading call history...</span>
                  </div>
                ) : dossierLogs.length === 0 ? (
                  <p className="text-[#8A8680] italic text-xs py-2">
                    No prior call attempts recorded for this lead.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {dossierLogs.map((log) => {
                      const badge = getOutcomeBadge(log.outcome);
                      const BadgeIcon = badge.icon;
                      return (
                        <div
                          key={log.id}
                          className="p-3 rounded-lg bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 space-y-1.5"
                        >
                          <div className="flex items-center justify-between">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border inline-flex items-center gap-1 ${badge.color}`}
                            >
                              <BadgeIcon className="w-2.5 h-2.5" />
                              {badge.label}
                            </span>
                            <span className="text-[11px] font-mono text-[#8A8680]">
                              {formatRelativeTime(log.called_at)} · {log.caller_name}
                            </span>
                          </div>
                          {log.notes && (
                            <p className="text-[#6E6B66] dark:text-[#B5B2AC] text-xs italic pl-1 border-l-2 border-[#F95721]/40">
                              &ldquo;{log.notes}&rdquo;
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 border-t border-[#ECE8E1] dark:border-[#2D2924] flex justify-end">
              <button
                type="button"
                onClick={() => setIsDossierOpen(false)}
                className="px-4 py-2 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 rounded-xl text-xs font-semibold text-[#111110] dark:text-[#F5F3EF] transition"
              >
                Close Dossier
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
