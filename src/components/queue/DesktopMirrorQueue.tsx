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
  const norm = outcome.toLowerCase();
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
        label: norm.replace("_", " "),
        color: "text-zinc-400 bg-zinc-800 border-zinc-700",
      };
  }
}

export function DesktopMirrorQueue({ callerId }: { callerId: string }) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [caller, setCaller] = useState<CallerProfile | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
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

  // Latest call log for current lead
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

  const currentLead = leads[activeLeadIndex] || null;

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
      // Same ordering as caller's mobile cockpit: priority callbacks -> ready to dial -> cooldown
      const { data: leadsData, error: leadsErr } = await supabase
        .from("leads")
        .select("*, profiles:assigned_to(full_name)")
        .eq("assigned_to", callerId)
        .is("deleted_at", null)
        .not("status", "in", '("closed_won","closed_lost","dnc","not_interested")')
        .order("next_callback_at", { ascending: true, nullsFirst: false })
        .order("score", { ascending: false });

      if (leadsErr) throw leadsErr;

      const rawLeads: Lead[] = leadsData || [];

      // Partition into the 4-state pipeline
      const now = new Date();
      let dialNowCount = 0;
      let callbackCount = 0;
      let overdueCallbackCount = 0;
      let waitingCount = 0;

      const sortedLeads: Lead[] = [];
      const readyBucket: Lead[] = [];
      const callbackBucket: Lead[] = [];
      const cooldownBucket: Lead[] = [];

      rawLeads.forEach((lead) => {
        const isCallback = lead.status === "callback" || Boolean(lead.next_callback_at);
        const isCooldown = lead.cooldown_until && new Date(lead.cooldown_until) > now;

        if (isCallback) {
          callbackCount++;
          if (lead.next_callback_at && new Date(lead.next_callback_at) <= now) {
            overdueCallbackCount++;
          }
          callbackBucket.push(lead);
        } else if (isCooldown) {
          waitingCount++;
          cooldownBucket.push(lead);
        } else {
          dialNowCount++;
          readyBucket.push(lead);
        }
      });

      // Unified sequence identical to caller's mobile queue view:
      // Ready to Dial -> Callbacks -> Cooldown
      sortedLeads.push(...readyBucket, ...callbackBucket, ...cooldownBucket);
      setLeads(sortedLeads);

      // Fetch calls completed today by this caller (IST Day Start: UTC+5:30)
      const istOffsetMs = 5.5 * 60 * 60 * 1000;
      const istNow = new Date(Date.now() + istOffsetMs);
      const istDateStr = istNow.toISOString().split("T")[0];
      const istStartUtc = new Date(
        new Date(`${istDateStr}T00:00:00.000Z`).getTime() - istOffsetMs
      ).toISOString();

      const { count: doneCount } = await supabase
        .from("calls")
        .select("*", { count: "exact", head: true })
        .eq("caller_id", callerId)
        .gte("called_at", istStartUtc);

      setPipeline({
        dialNow: dialNowCount,
        callbacks: callbackCount,
        overdueCallbacks: overdueCallbackCount,
        waiting: waitingCount,
        done: doneCount || 0,
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

  // 3. Fetch Historical Call Logs for Dossier
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
        caller_name: l.caller?.full_name || "Caller",
      }));

      setDossierLogs(logs);
    } catch (err) {
      console.warn("Could not load dossier logs:", err);
    } finally {
      setLoadingDossier(false);
    }
  }, [currentLead, supabase]);

  function handleExitMirror() {
    router.push("/studio/manager/team");
  }

  function handleCopyPhone(phone: string) {
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

      {/* 2. TODAY'S PIPELINE STRIP (Below banner, 4-number format matching Team Center) */}
      <div className="w-full bg-white dark:bg-[#181614] border-b border-[#ECE8E1] dark:border-[#2D2924] px-4 sm:px-8 py-2.5 flex items-center justify-between overflow-x-auto text-xs">
        <div className="flex items-center gap-4 sm:gap-6 font-mono shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-[#6E6B66] dark:text-[#8A8680]">Dial Now</span>
            <span className="font-bold text-[#F95721] px-2 py-0.5 bg-[#F95721]/10 rounded border border-[#F95721]/20">
              {pipeline.dialNow}
            </span>
          </div>

          <span className="text-[#ECE8E1] dark:text-[#2D2924]">·</span>

          <div className="flex items-center gap-2">
            <span className="text-[#6E6B66] dark:text-[#8A8680]">Callbacks</span>
            <span
              className={`font-bold px-2 py-0.5 rounded border ${
                pipeline.overdueCallbacks > 0
                  ? "text-rose-400 bg-rose-500/10 border-rose-500/20"
                  : "text-amber-400 bg-amber-500/10 border-amber-500/20"
              }`}
            >
              {pipeline.callbacks}
              {pipeline.overdueCallbacks > 0 && ` (${pipeline.overdueCallbacks} overdue)`}
            </span>
          </div>

          <span className="text-[#ECE8E1] dark:text-[#2D2924]">·</span>

          <div className="flex items-center gap-2">
            <span className="text-[#6E6B66] dark:text-[#8A8680]">Waiting</span>
            <span className="font-bold text-zinc-400 px-2 py-0.5 bg-black/5 dark:bg-white/5 rounded border border-black/10 dark:border-white/10">
              {pipeline.waiting}
            </span>
          </div>

          <span className="text-[#ECE8E1] dark:text-[#2D2924]">·</span>

          <div className="flex items-center gap-2">
            <span className="text-[#6E6B66] dark:text-[#8A8680]">Done</span>
            <span className="font-bold text-emerald-400 px-2 py-0.5 bg-emerald-500/10 rounded border border-emerald-500/20">
              {pipeline.done}
            </span>
          </div>
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
        ) : leads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] rounded-2xl p-8 text-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-500" />
            <h2 className="text-base font-bold">Queue is Clean</h2>
            <p className="text-xs text-[#8A8680] max-w-md">
              {callerDisplayName} has no active leads assigned or pending dial in their queue right now.
            </p>
            <button
              type="button"
              onClick={handleExitMirror}
              className="mt-4 px-4 py-2 bg-[#F95721] hover:bg-[#E04612] text-white text-xs font-semibold rounded-xl transition"
            >
              Return to Team Command Center
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* LEFT COLUMN (60%): CURRENT LEAD CARD */}
            <div className="lg:col-span-7 bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] rounded-2xl p-6 sm:p-8 shadow-sm flex flex-col justify-between space-y-6">
              {/* Lead Sequence & Target Decision Maker Header */}
              <div>
                <div className="flex items-center justify-between text-xs font-mono text-[#8A8680] mb-2">
                  <span>
                    LEAD {activeLeadIndex + 1} OF {leads.length}
                  </span>
                  <span className="flex items-center gap-1.5 text-zinc-400">
                    <User className="w-3.5 h-3.5" />
                    Assigned: {callerDisplayName}
                  </span>
                </div>

                {/* Business Name (Large) */}
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#111110] dark:text-[#F5F3EF] leading-tight">
                  {formatLeadName(currentLead?.name)}
                </h1>

                {/* Niche · Area · Attempt X/5 Badges */}
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <span className="px-2.5 py-1 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-xs font-medium rounded-lg text-[#111110] dark:text-[#F5F3EF]">
                    {currentLead?.niche || "Dental"}
                  </span>
                  <span className="px-2.5 py-1 bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-xs font-medium rounded-lg text-[#6E6B66] dark:text-[#8A8680]">
                    {currentLead?.area || "Pune"}
                  </span>
                  <span className="px-2.5 py-1 bg-[#F95721]/10 border border-[#F95721]/20 text-[#F95721] text-xs font-mono font-semibold rounded-lg">
                    Attempt {currentLead?.attempts_count || 1}/5
                  </span>
                  {currentLead?.status === "callback" && (
                    <span className="px-2.5 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium rounded-lg">
                      Callback Scheduled
                    </span>
                  )}
                </div>
              </div>

              {/* Ask for: Decision Maker */}
              <div className="p-3.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-[#ECE8E1] dark:border-[#2D2924] flex items-center gap-2.5 text-xs">
                <div className="w-7 h-7 rounded-lg bg-[#F95721]/10 flex items-center justify-center text-[#F95721] shrink-0">
                  <User className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] uppercase font-mono tracking-wider text-[#8A8680] block">
                    Decision Maker
                  </span>
                  <span className="font-semibold text-[#111110] dark:text-[#F5F3EF]">
                    Ask for: {resolveDecisionMaker(currentLead)}
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
                      Prior Contact Status
                    </span>
                    {loadingCall ? (
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

                {latestCall?.notes && (
                  <span
                    className="text-[11px] text-[#8A8680] max-w-[200px] truncate italic hidden sm:inline"
                    title={latestCall.notes}
                  >
                    &ldquo;{latestCall.notes}&rdquo;
                  </span>
                )}
              </div>

              {/* Target Phone Number */}
              <div className="p-4 rounded-xl bg-black/[0.03] dark:bg-white/[0.03] border border-[#ECE8E1] dark:border-[#2D2924] flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-mono tracking-wider text-[#8A8680] block mb-0.5">
                    Target Primary Line
                  </span>
                  <span className="font-mono text-xl sm:text-2xl font-extrabold tracking-tight text-[#111110] dark:text-[#F5F3EF]">
                    {formatPhoneDisplay(currentLead?.phone)}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => handleCopyPhone(currentLead?.phone)}
                  className="px-3 py-2 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 rounded-xl text-xs font-medium flex items-center gap-1.5 transition text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF]"
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

              {/* Physical Location & Website (Secondary Info) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                {/* Physical Address */}
                <div className="p-3 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] border border-[#ECE8E1] dark:border-[#2D2924] space-y-1">
                  <span className="text-[10px] uppercase font-mono text-[#8A8680] block flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    Physical Address
                  </span>
                  <p className="text-[#6E6B66] dark:text-[#8A8680] line-clamp-2 leading-relaxed">
                    {currentLead?.address || `${currentLead?.area}, Pune`}
                  </p>
                </div>

                {/* Website */}
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

            {/* RIGHT COLUMN (40%): DECK QUEUE SIDEBAR */}
            <div className="lg:col-span-5 bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] rounded-2xl p-5 shadow-sm flex flex-col h-[calc(100vh-180px)] sticky top-24">
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-[#ECE8E1] dark:border-[#2D2924] shrink-0">
                <div>
                  <h2 className="text-xs font-mono uppercase tracking-wider font-bold text-[#111110] dark:text-[#F5F3EF]">
                    DECK QUEUE
                  </h2>
                  <p className="text-[11px] text-[#8A8680] mt-0.5">
                    Sequence seen by {callerDisplayName}
                  </p>
                </div>
                <span className="px-2 py-0.5 rounded-lg text-xs font-mono font-bold bg-[#F95721]/10 text-[#F95721] border border-[#F95721]/20">
                  {leads.length} leads
                </span>
              </div>

              {/* Scrollable List */}
              <div className="flex-1 overflow-y-auto space-y-2 pt-3 pr-1">
                {leads.map((lead, idx) => {
                  const isActive = idx === activeLeadIndex;
                  const isCallback = lead.status === "callback" || Boolean(lead.next_callback_at);
                  const isCooldown = lead.cooldown_until && new Date(lead.cooldown_until) > new Date();

                  return (
                    <button
                      key={lead.id}
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
                      </div>

                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-[#8A8680]">
                          Att. {lead.attempts_count || 1}/5
                        </span>
                        {isCallback ? (
                          <span className="text-[10px] font-semibold text-amber-400">
                            Callback
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
                })}
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
