"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Phone,
  Clock,
  MapPin,
  Calendar,
  CheckCircle,
  AlertTriangle,
  Loader2,
  FileText,
  ExternalLink,
  ChevronRight,
  ChevronLeft,
  X,
  RefreshCw,
  LogOut,
  User,
  Shield,
  MessageSquare,
  Sparkles,
  Flame,
  Check,
  Radio,
  Eye,
  CheckSquare,
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

export interface CallerShiftStats {
  totalDials: number;
  connects: number;
  totalTalkSeconds: number;
  interested: number;
  callbacks: number;
  noAnswer: number;
  rejected: number;
  dnc: number;
}

interface CallerCockpitProps {
  readOnly?: boolean;
}

/**
 * Normalizes phone number to clean Indian format: +91 97654 07679
 */
function formatPhoneDisplay(phone: string | null | undefined): string {
  if (!phone) return "No Phone";
  const cleaned = phone.trim().replace(/\D/g, "");
  let core10 = cleaned;
  if (cleaned.length === 11 && cleaned.startsWith("0")) core10 = cleaned.slice(1);
  else if (cleaned.length === 12 && cleaned.startsWith("91")) core10 = cleaned.slice(2);
  if (core10.length === 10) return `+91 ${core10.slice(0, 5)} ${core10.slice(5)}`;
  return phone;
}

function formatTelLink(phone: string | null | undefined): string {
  if (!phone) return "";
  const cleaned = phone.trim().replace(/\D/g, "");
  let core10 = cleaned;
  if (cleaned.length === 11 && cleaned.startsWith("0")) core10 = cleaned.slice(1);
  else if (cleaned.length === 12 && cleaned.startsWith("91")) core10 = cleaned.slice(2);
  if (core10.length === 10) return `tel:+91${core10}`;
  return `tel:+91${cleaned}`;
}

function formatLeadName(name: string | null | undefined): string {
  if (!name) return "Unnamed Clinic";
  let cleaned = name.trim().replace(/([a-zA-Z0-9'’])\s*-\s*([a-zA-Z0-9])/g, "$1 - $2");
  cleaned = cleaned.replace(/\bDr\.([A-Za-z])/gi, "Dr. $1");
  cleaned = cleaned.replace(/\bDr(?!\.)\s+/gi, "Dr. ");
  return cleaned.replace(/\s+/g, " ").trim();
}

/**
 * Resolves decision maker fallback gracefully:
 * - If name is specified: Dr. Kaustubh Patil (Owner)
 * - If no name in DB: "Ask for the owner" (actionable human instruction, not data label)
 */
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

/**
 * Formats prior contact summary: "Yesterday, 4:15 PM · No Answer" or "Oct 1, 11:30 AM · Gatekeeper"
 */
function formatPriorContactSummary(calledAt: string, outcome: string): string {
  const d = new Date(calledAt);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
  const timeMs = d.getTime();

  let dayLabel = "";
  if (timeMs >= startOfToday) {
    dayLabel = "Today";
  } else if (timeMs >= startOfYesterday) {
    dayLabel = "Yesterday";
  } else {
    dayLabel = d.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
  }

  const timeLabel = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
  const outcomeLabel = outcome.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return `${dayLabel}, ${timeLabel} · ${outcomeLabel}`;
}

function formatRelativeTime(dateString: string | null | undefined): string {
  if (!dateString) return "Never";
  const date = new Date(dateString);
  const now = new Date();
  const diffSec = Math.round((now.getTime() - date.getTime()) / 1000);

  if (diffSec < 60) return "Just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 172800) return "Yesterday";
  return date.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
}

function formatDurationTimer(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function formatHoursMinutes(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

/**
 * Web Audio API synthesizer for instant tactile mobile haptic feedback
 */
function playHapticTick(freq = 900, duration = 0.018) {
  try {
    if (typeof window === "undefined") return;
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    if (ctx.state === "suspended") ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch {
    // Audio context silently ignored if unavailable
  }
}

export function CallerCockpit({ readOnly = false }: CallerCockpitProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const impersonateParam = searchParams.get("impersonate");
  const supabase = createClient();

  // Screen Views: 'cockpit' (Screen 1) | 'detail' (Screen 3 Dossier) | 'comms' | 'summary' (Screen 4 Daily Report) | 'callbacks' | 'waiting'
  const [activeScreen, setActiveScreen] = useState<
    "cockpit" | "detail" | "comms" | "summary" | "callbacks" | "waiting"
  >("cockpit");

  // Bottom Navigation Active: 'queue' | 'comms' | 'today' | 'profile'
  const [activeBottomNav, setActiveBottomNav] = useState<"queue" | "comms" | "today" | "profile">("queue");

  // Pipeline tab: 'dialNow' | 'callbacks' | 'waiting' | 'done'
  const [pipelineTab, setPipelineTab] = useState<"dialNow" | "callbacks" | "waiting" | "done">("dialNow");

  // Leads state
  const [dialNowLeads, setDialNowLeads] = useState<Lead[]>([]);
  const [callbackLeads, setCallbackLeads] = useState<Lead[]>([]);
  const [waitingLeads, setWaitingLeads] = useState<Lead[]>([]);
  const [activeLeadIndex, setActiveLeadIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  // Active Lead Call History
  const [historicalLogs, setHistoricalLogs] = useState<HistoricalCallLog[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Shift Performance / Daily Report stats
  const [shiftStats, setShiftStats] = useState<CallerShiftStats>({
    totalDials: 0,
    connects: 0,
    totalTalkSeconds: 0,
    interested: 0,
    callbacks: 0,
    noAnswer: 0,
    rejected: 0,
    dnc: 0,
  });

  // User Profile
  const [currentUserProfile, setCurrentUserProfile] = useState<{
    id: string;
    full_name: string;
    role: string;
    email?: string;
  } | null>(null);

  // Impersonation details (if mirroring)
  const [impersonatedCaller, setImpersonatedCaller] = useState<{
    id: string;
    full_name: string;
  } | null>(null);

  // Drawers & Sheets
  const [isDispositionDrawerOpen, setIsDispositionDrawerOpen] = useState(false);
  const [isDeckQueueOpen, setIsDeckQueueOpen] = useState(false);
  const [isProfileSheetOpen, setIsProfileSheetOpen] = useState(false);
  const [isCallbackSubmenuOpen, setIsCallbackSubmenuOpen] = useState(false);

  // Active Call Timer
  const [inCall, setInCall] = useState(false);
  const [callStartTime, setCallStartTime] = useState<number | null>(null);
  const [callElapsedSeconds, setCallElapsedSeconds] = useState(0);
  const dialerOpenedRef = useRef(false);

  // Post-Call Form State
  const [quickNote, setQuickNote] = useState("");
  const [selectedCallbackSlot, setSelectedCallbackSlot] = useState<string>("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [dncConfirmed, setDncConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Card Animation Trigger
  const [cardAnimating, setCardAnimating] = useState(false);

  // Selected lead based on tab
  const activeLeadsList = pipelineTab === "callbacks" ? callbackLeads : dialNowLeads;
  const currentLead = activeLeadsList[activeLeadIndex] || null;

  // 1. Live In-Call Timer
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (inCall && callStartTime) {
      setCallElapsedSeconds(Math.max(0, Math.floor((Date.now() - callStartTime) / 1000)));
      interval = setInterval(() => {
        setCallElapsedSeconds(Math.max(0, Math.floor((Date.now() - callStartTime) / 1000)));
      }, 1000);
    } else {
      setCallElapsedSeconds(0);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [inCall, callStartTime]);

  // 2. Auto-open disposition drawer upon returning from phone dialer
  useEffect(() => {
    function handleReturnFromDialer() {
      const isDialing =
        dialerOpenedRef.current ||
        (typeof window !== "undefined" && sessionStorage.getItem("pinsite_dialer_active") === "true");

      if (document.visibilityState === "visible" && isDialing) {
        dialerOpenedRef.current = false;
        if (typeof window !== "undefined") {
          sessionStorage.removeItem("pinsite_dialer_active");
        }
        setInCall(false);
        setIsDispositionDrawerOpen(true);
        playHapticTick(750, 0.02);
      }
    }

    document.addEventListener("visibilitychange", handleReturnFromDialer);
    window.addEventListener("focus", handleReturnFromDialer);
    window.addEventListener("pageshow", handleReturnFromDialer);

    return () => {
      document.removeEventListener("visibilitychange", handleReturnFromDialer);
      window.removeEventListener("focus", handleReturnFromDialer);
      window.removeEventListener("pageshow", handleReturnFromDialer);
    };
  }, []);

  // 3. Load Leads & Stats
  const loadLeadsAndStats = useCallback(
    async (silent: boolean = false) => {
      if (!silent) setLoading(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          if (!silent) setLoading(false);
          return;
        }

        // Fetch user profile
        const { data: myProfile } = await supabase
          .from("profiles")
          .select("id, full_name, role")
          .eq("id", user.id)
          .maybeSingle();

        setCurrentUserProfile({
          id: user.id,
          full_name: myProfile?.full_name || "Caller",
          role: myProfile?.role || "caller",
          email: user.email,
        });

        let targetCallerId = user.id;

        // Impersonation check
        if (impersonateParam && (myProfile?.role === "admin" || myProfile?.role === "manager")) {
          const { data: callerData } = await supabase
            .from("profiles")
            .select("id, full_name")
            .eq("id", impersonateParam)
            .maybeSingle();

          if (callerData) {
            targetCallerId = callerData.id;
            setImpersonatedCaller({ id: callerData.id, full_name: callerData.full_name });
          }
        }

        // Query all assigned active leads for this caller
        const { data: leadsData, error: leadsErr } = await supabase
          .from("leads")
          .select("*, profiles:assigned_to(full_name)")
          .eq("assigned_to", targetCallerId)
          .is("deleted_at", null)
          .not("status", "in", '("closed_won","closed_lost","dnc","not_interested")')
          .order("next_callback_at", { ascending: true, nullsFirst: false })
          .order("score", { ascending: false });

        if (leadsErr) throw leadsErr;

        const allLeads: Lead[] = leadsData || [];

        // Partition leads into Pipeline tabs
        const callbacks: Lead[] = [];
        const waiting: Lead[] = [];
        const dialNow: Lead[] = [];

        allLeads.forEach((lead) => {
          const isCallback = lead.status === "callback" || Boolean(lead.next_callback_at);
          const isCooldown = lead.cooldown_until && new Date(lead.cooldown_until) > new Date();

          if (isCallback) {
            callbacks.push(lead);
          } else if (isCooldown) {
            waiting.push(lead);
          } else {
            dialNow.push(lead);
          }
        });

        setDialNowLeads(dialNow);
        setCallbackLeads(callbacks);
        setWaitingLeads(waiting);

        // Fetch today's calls for shift stats (IST Day Start: UTC+5:30)
        const istOffsetMs = 5.5 * 60 * 60 * 1000;
        const istNow = new Date(Date.now() + istOffsetMs);
        const istDateStr = istNow.toISOString().split("T")[0];
        const istStartUtc = new Date(
          new Date(`${istDateStr}T00:00:00.000Z`).getTime() - istOffsetMs
        ).toISOString();

        const { data: todayCalls } = await supabase
          .from("calls")
          .select("id, outcome, duration_seconds, called_at")
          .eq("caller_id", targetCallerId)
          .gte("called_at", istStartUtc);

        const calls = todayCalls || [];
        let totalTalkSec = 0;
        let interestedCount = 0;
        let callbackCount = 0;
        let noAnswerCount = 0;
        let rejectedCount = 0;
        let dncCount = 0;
        let connectCount = 0;

        calls.forEach((c) => {
          totalTalkSec += c.duration_seconds || 0;
          if (c.outcome === "interested") interestedCount++;
          else if (c.outcome === "callback") callbackCount++;
          else if (c.outcome === "no_answer") noAnswerCount++;
          else if (c.outcome === "not_interested") rejectedCount++;
          else if (c.outcome === "dnc") dncCount++;

          if (c.outcome !== "no_answer") {
            connectCount++;
          }
        });

        setShiftStats({
          totalDials: calls.length,
          connects: connectCount,
          totalTalkSeconds: totalTalkSec,
          interested: interestedCount,
          callbacks: callbackCount,
          noAnswer: noAnswerCount,
          rejected: rejectedCount,
          dnc: dncCount,
        });
      } catch (err) {
        console.warn("Failed to load cockpit leads:", err);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [supabase, impersonateParam]
  );

  useEffect(() => {
    loadLeadsAndStats();
  }, [loadLeadsAndStats]);

  // 4. Fetch past call history whenever active lead changes
  useEffect(() => {
    if (!currentLead) {
      setHistoricalLogs([]);
      return;
    }
    let isCurrent = true;
    setLoadingHistory(true);

    async function fetchLeadHistory() {
      try {
        const { data } = await supabase
          .from("calls")
          .select("id, notes, outcome, duration_seconds, called_at, profiles:caller_id(full_name)")
          .eq("lead_id", currentLead!.id)
          .order("called_at", { ascending: false })
          .limit(5);

        if (!isCurrent) return;

        if (data && data.length > 0) {
          setHistoricalLogs(
            data.map((c: any) => ({
              id: c.id,
              notes: c.notes,
              outcome: c.outcome,
              duration_seconds: c.duration_seconds,
              called_at: c.called_at,
              caller_name: c.profiles?.full_name || "Caller",
            }))
          );
        } else {
          setHistoricalLogs([]);
        }
      } catch {
        if (isCurrent) setHistoricalLogs([]);
      } finally {
        if (isCurrent) setLoadingHistory(false);
      }
    }

    fetchLeadHistory();
    return () => {
      isCurrent = false;
    };
  }, [currentLead?.id, supabase]);

  // 5. Dial Trigger Action
  const handleDialClick = () => {
    if (readOnly || !currentLead) return;
    setInCall(true);
    setCallStartTime(Date.now());
    dialerOpenedRef.current = true;
    if (typeof window !== "undefined") {
      sessionStorage.setItem("pinsite_dialer_active", "true");
    }
    playHapticTick(1100, 0.03);
  };

  // 6. Outcome Submission
  const handleSubmitOutcome = async (outcomeType: string, targetState = "dialNow") => {
    if (readOnly || !currentLead || isSubmitting) return;

    if (outcomeType === "dnc" && !dncConfirmed) {
      alert("Please confirm the Do Not Call (DNC) checkmark before removing lead.");
      return;
    }

    if (outcomeType === "not_interested" && !rejectionReason.trim()) {
      alert("Please provide a rejection reason for quarantine holding.");
      return;
    }

    setIsSubmitting(true);
    playHapticTick(1200, 0.03);

    const duration = callStartTime ? Math.round((Date.now() - callStartTime) / 1000) : callElapsedSeconds;

    let callbackTimestamp: string | null = null;
    if (outcomeType === "callback") {
      if (selectedCallbackSlot === "+30m") {
        callbackTimestamp = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      } else if (selectedCallbackSlot === "today_430") {
        const d = new Date();
        d.setHours(16, 30, 0, 0);
        callbackTimestamp = d.toISOString();
      } else if (selectedCallbackSlot === "tomorrow_10") {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        d.setHours(10, 0, 0, 0);
        callbackTimestamp = d.toISOString();
      } else if (selectedCallbackSlot) {
        callbackTimestamp = new Date(selectedCallbackSlot).toISOString();
      } else {
        callbackTimestamp = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
      }
    }

    const payload: Record<string, any> = {
      p_lead_id: currentLead.id,
      p_status: outcomeType,
      p_callback_at: callbackTimestamp,
      p_notes: quickNote.trim() || null,
      p_duration_seconds: duration,
      p_rejection_reason:
        outcomeType === "not_interested" ? rejectionReason.trim() || "Rejected by caller" : null,
    };

    if (impersonatedCaller) {
      payload.p_impersonate_caller_id = impersonatedCaller.id;
    }

    try {
      const res = await fetch("/api/queue/outcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || "Failed to log outcome");
      }

      // Close drawer & reset fields
      setIsDispositionDrawerOpen(false);
      setIsCallbackSubmenuOpen(false);
      setQuickNote("");
      setSelectedCallbackSlot("");
      setRejectionReason("");
      setDncConfirmed(false);
      setInCall(false);
      setCallStartTime(null);

      // Trigger spring crossfade animation
      setCardAnimating(true);
      setTimeout(() => {
        loadLeadsAndStats(true);
        setCardAnimating(false);
        playHapticTick(950, 0.02);
      }, 220);
    } catch (err: any) {
      alert(`Error submitting call: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 7. Skip Lead Action
  const handleSkipLead = () => {
    playHapticTick(700, 0.02);
    if (activeLeadsList.length > 1) {
      setActiveLeadIndex((prev) => (prev + 1) % activeLeadsList.length);
    }
  };

  // 8. Navigation handler between 4 bottom tabs
  const handleBottomNavClick = (tabKey: "queue" | "comms" | "today" | "profile") => {
    playHapticTick(850, 0.02);
    setActiveBottomNav(tabKey);
    if (tabKey === "queue") {
      setActiveScreen("cockpit");
      setIsProfileSheetOpen(false);
    } else if (tabKey === "comms") {
      router.push("/comms");
    } else if (tabKey === "today") {
      setActiveScreen("summary");
      setIsProfileSheetOpen(false);
    } else if (tabKey === "profile") {
      setIsProfileSheetOpen(true);
    }
  };

  // 9. Pipeline Tab selection
  const handlePipelineTabSelect = (tab: "dialNow" | "callbacks" | "waiting" | "done") => {
    playHapticTick(900, 0.02);
    setPipelineTab(tab);
    setActiveLeadIndex(0);
    if (tab === "dialNow") {
      setActiveScreen("cockpit");
    } else if (tab === "callbacks") {
      setActiveScreen("callbacks");
    } else if (tab === "waiting") {
      setActiveScreen("waiting");
    } else if (tab === "done") {
      setActiveScreen("summary");
    }
  };

  // Latest call note snapshot for the hero card
  const latestHistoricalNote = historicalLogs[0] || null;

  // Website details
  const realWebsite = currentLead?.website && !currentLead.website.includes("maps") ? currentLead.website : null;
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${currentLead?.name || ""} ${currentLead?.address || currentLead?.area || ""}`
  )}`;

  return (
    <div className="w-full max-w-[420px] mx-auto min-h-screen bg-[#0c0c0e] text-zinc-100 flex flex-col justify-between overflow-x-hidden relative select-none font-sans sm:border-x sm:border-[#202025]">
      {/* SKELETON LOADING STATE */}
      {loading ? (
        <div className="flex-1 p-4 space-y-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="w-32 h-6 rounded-full bg-zinc-800 animate-pulse" />
            <div className="w-16 h-5 rounded-md bg-zinc-800 animate-pulse" />
          </div>
          <div className="w-full h-[290px] rounded-[26px] bg-zinc-900 border border-white/[0.06] p-5 flex flex-col justify-between animate-pulse">
            <div className="w-48 h-4 rounded-md bg-zinc-800" />
            <div className="space-y-2">
              <div className="w-full h-6 rounded-md bg-zinc-800" />
              <div className="w-3/4 h-5 rounded-md bg-zinc-800" />
            </div>
            <div className="w-full h-12 rounded-xl bg-zinc-800" />
          </div>
          <div className="w-full h-14 rounded-[22px] bg-zinc-800 animate-pulse" />
          <div className="grid grid-cols-2 gap-2">
            <div className="h-11 rounded-2xl bg-zinc-800 animate-pulse" />
            <div className="h-11 rounded-2xl bg-zinc-800 animate-pulse" />
          </div>
        </div>
      ) : (
        <>
          {/* READ-ONLY / MIRROR MODE AMBER BANNER */}
          {(readOnly || impersonatedCaller) && (
            <div className="w-full px-4 py-2 bg-amber-500/15 border-b border-amber-500/30 text-amber-300 text-xs flex items-center justify-between z-40 backdrop-blur-md">
              <div className="flex items-center gap-2 min-w-0">
                <Eye className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" />
                <span className="font-bold text-[11px] truncate">
                  Mirroring: {impersonatedCaller?.full_name || "Caller"} • Read Only
                </span>
              </div>
              <button
                type="button"
                onClick={() => router.push("/manager/team")}
                className="px-2.5 py-0.5 bg-black/40 hover:bg-black/60 border border-amber-500/30 text-amber-300 rounded-lg text-[10px] font-bold shrink-0"
              >
                Exit
              </button>
            </div>
          )}

          {/* AMBIENT IN-PROGRESS CALL BANNER */}
          {inCall && (
            <div className="w-full px-4 py-2 bg-emerald-950/90 border-b border-emerald-500/30 flex items-center justify-between text-xs z-40 backdrop-blur-md shadow-md animate-in slide-in-from-top-1 duration-150">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                <span className="text-emerald-300 font-bold text-[11px] uppercase tracking-wide">
                  Call in progress:
                </span>
                <span className="font-mono text-white font-bold tabular-nums">
                  {formatDurationTimer(callElapsedSeconds)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setInCall(false);
                  setIsDispositionDrawerOpen(true);
                  playHapticTick(800, 0.02);
                }}
                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] rounded-lg shadow-sm active:scale-95 transition"
              >
                Return & Log ›
              </button>
            </div>
          )}

          {/* APP HEADER & SEGMENTED 4-TAB PIPELINE */}
          <header className="w-full px-3.5 sm:px-4 pt-2.5 pb-2 bg-[#0c0c0e]/95 backdrop-blur-xl border-b border-white/[0.06] z-30 shrink-0">
            <div className="flex items-center justify-between mb-2 px-0.5">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-[#F95721] shadow-sm shadow-[#F95721]/50" />
                <span className="text-xs font-black tracking-widest text-zinc-200 uppercase">
                  Pinsite CRM
                </span>
                <span className="text-[10px] font-bold tracking-wider text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Queue Active
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsDeckQueueOpen(true);
                  playHapticTick(800, 0.02);
                }}
                className="flex items-center gap-1.5 bg-zinc-800/90 hover:bg-zinc-700 active:scale-95 text-zinc-300 text-xs px-2.5 py-1 rounded-full border border-zinc-700/60 transition"
              >
                <FileText className="w-3 h-3 text-[#F95721]" />
                <span className="text-[11px] font-semibold">Queue ({dialNowLeads.length})</span>
              </button>
            </div>

            {/* Segmented Pipeline Tabs */}
            <nav className="grid grid-cols-4 gap-1 p-1 bg-[#141418] rounded-2xl border border-white/[0.06] text-xs shadow-inner">
              <button
                type="button"
                onClick={() => handlePipelineTabSelect("dialNow")}
                className={`py-1.5 rounded-xl flex flex-col items-center justify-center transition active:scale-95 ${
                  pipelineTab === "dialNow"
                    ? "bg-zinc-800 text-white shadow-sm font-semibold"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <span className="leading-none text-[10px] uppercase font-bold tracking-wider text-[#F95721]">
                  Dial Now
                </span>
                <span className="text-sm font-bold text-white tabular-nums mt-0.5">
                  {dialNowLeads.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => handlePipelineTabSelect("callbacks")}
                className={`py-1.5 rounded-xl flex flex-col items-center justify-center transition active:scale-95 ${
                  pipelineTab === "callbacks"
                    ? "bg-zinc-800 text-white shadow-sm font-semibold"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <span className="leading-none text-[10px] uppercase font-bold tracking-wider text-amber-400">
                  Callbacks
                </span>
                <span className="text-sm font-bold text-amber-400 tabular-nums mt-0.5">
                  {callbackLeads.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => handlePipelineTabSelect("waiting")}
                className={`py-1.5 rounded-xl flex flex-col items-center justify-center transition active:scale-95 ${
                  pipelineTab === "waiting"
                    ? "bg-zinc-800 text-white shadow-sm font-semibold"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <span className="leading-none text-[10px] uppercase font-bold tracking-wider">
                  Waiting
                </span>
                <span className="text-sm font-bold text-zinc-300 tabular-nums mt-0.5">
                  {waitingLeads.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => handlePipelineTabSelect("done")}
                className={`py-1.5 rounded-xl flex flex-col items-center justify-center transition active:scale-95 ${
                  pipelineTab === "done"
                    ? "bg-zinc-800 text-white shadow-sm font-semibold"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <span className="leading-none text-[10px] uppercase font-bold tracking-wider text-emerald-400">
                  Done
                </span>
                <span className="text-sm font-bold text-emerald-400 tabular-nums mt-0.5">
                  {shiftStats.totalDials}
                </span>
              </button>
            </nav>
          </header>

          {/* MAIN BODY CONTAINER */}
          <main className="flex-1 relative overflow-hidden flex flex-col px-3.5 sm:px-4 pt-2.5 pb-2">
            {/* SCREEN 1: COCKPIT VIEW */}
            {activeScreen === "cockpit" && (
              <div className="flex-1 flex flex-col justify-between">
                {!currentLead ? (
                  // EMPTY STATE (All Caught Up)
                  <div className="flex-1 flex flex-col items-center justify-center text-center px-4 py-8">
                    <div className="w-14 h-14 rounded-3xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-3 shadow-lg shadow-emerald-500/10">
                      <CheckCircle className="w-7 h-7" />
                    </div>
                    <h3 className="text-base font-black text-white">All Caught Up in Dial Now!</h3>
                    <p className="text-xs text-zinc-400 mt-1.5 max-w-[260px] leading-relaxed">
                      You&apos;ve dialed every ready lead in your queue.
                      {waitingLeads.length > 0 && (
                        <span>
                          {" "}
                          {waitingLeads.length} leads in cooldown will return automatically.
                        </span>
                      )}
                    </p>
                    <div className="mt-5 w-full flex flex-col gap-2">
                      {callbackLeads.length > 0 && (
                        <button
                          type="button"
                          onClick={() => handlePipelineTabSelect("callbacks")}
                          className="w-full py-3 bg-amber-500/15 border border-amber-500/30 text-amber-300 font-bold text-xs rounded-xl hover:bg-amber-500/25 active:scale-95 transition"
                        >
                          View {callbackLeads.length} Callbacks Due Today ›
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => loadLeadsAndStats()}
                        className="w-full py-2.5 bg-zinc-900 border border-zinc-800 text-zinc-300 font-semibold text-xs rounded-xl hover:text-white active:scale-95 transition flex items-center justify-center gap-1.5"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Check for New Assignments</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  // ACTIVE HERO LEAD CARD
                  <div className="flex-1 flex flex-col justify-between">
                    <div>
                      {/* Attempt & Queue Indicator Bar (Bug 2 & 4 Fixed: whitespace-nowrap, zero wrapping) */}
                      <div className="flex items-center justify-between gap-1.5 px-0.5 mb-2 w-full">
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          <span className="px-2.5 py-0.5 bg-zinc-800 text-zinc-300 border border-white/10 rounded-full text-[11px] font-semibold max-w-[125px] truncate shrink-0">
                            {currentLead.niche} • {currentLead.area}
                          </span>
                          {/* Neutral Graphite Attempt Badge (NO AMBER COLLISION, ZERO WRAP) */}
                          <span className="px-2.5 py-0.5 bg-zinc-800/90 text-zinc-200 border border-zinc-700/80 rounded-full text-[11px] font-bold inline-flex items-center gap-1.5 shadow-sm whitespace-nowrap shrink-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 shrink-0" />
                            <span>Attempt {currentLead.attempts_count || 1} of 5</span>
                          </span>
                        </div>
                        <span className="text-xs text-zinc-400 font-mono whitespace-nowrap shrink-0 text-right">
                          Lead {activeLeadIndex + 1} of {activeLeadsList.length}
                        </span>
                      </div>

                      {/* HERO CARD CONTAINER */}
                      <div
                        className={`rounded-[26px] p-4 relative overflow-hidden flex flex-col justify-between min-h-[300px] bg-gradient-to-b from-[#1c1c21]/90 to-[#121216]/95 border border-white/[0.08] shadow-2xl transition-all duration-200 ${
                          cardAnimating ? "scale-95 opacity-0" : "scale-100 opacity-100"
                        }`}
                      >
                        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

                        {/* Top Status Strip */}
                        <div className="pb-2.5 border-b border-white/[0.08] flex items-center justify-between">
                          <div className="flex items-center gap-2 text-xs min-w-0 pr-2">
                            <span
                              className={`w-2 h-2 rounded-full shrink-0 ${
                                latestHistoricalNote ? "bg-amber-400" : "bg-emerald-400"
                              }`}
                            />
                            <div className="leading-tight min-w-0">
                              <span className="text-[9px] text-zinc-400 uppercase font-bold tracking-wider block">
                                Prior Contact Status
                              </span>
                              <strong className="text-white text-xs truncate block">
                                {latestHistoricalNote
                                  ? formatPriorContactSummary(latestHistoricalNote.called_at, latestHistoricalNote.outcome)
                                  : "Fresh Lead · Ready to Dial"}
                              </strong>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setActiveScreen("detail");
                              playHapticTick(850, 0.02);
                            }}
                            className="text-xs font-bold text-[#F95721] hover:text-orange-300 flex items-center gap-0.5 active:scale-95 transition shrink-0"
                          >
                            <span>Dossier</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Business Name & Decision Maker (Bug 7: Dominant scale, Bug 8: Human actionable instruction) */}
                        <div className="py-2.5">
                          <h2
                            className="text-2xl sm:text-[28px] font-black tracking-tight text-white leading-tight break-words line-clamp-2"
                            title={formatLeadName(currentLead.name)}
                          >
                            {formatLeadName(currentLead.name)}
                          </h2>

                          {/* Target Decision Maker Pill */}
                          <div className="mt-2.5 p-2 rounded-2xl bg-[#141418] border border-white/[0.06] flex items-center gap-2">
                            <div className="w-6 h-6 rounded-xl bg-[#F95721]/10 border border-[#F95721]/20 flex items-center justify-center shrink-0">
                              <User className="w-3.5 h-3.5 text-[#F95721]" />
                            </div>
                            <div className="overflow-hidden min-w-0">
                              <span className="text-[9px] uppercase font-bold tracking-wider text-zinc-400 block leading-none">
                                Target Decision Maker
                              </span>
                              <p className="text-xs font-bold text-white truncate mt-0.5">
                                {resolveDecisionMaker(currentLead)}
                              </p>
                            </div>
                          </div>

                          {/* CALLER NOTE BOX (View-Only Snapshot with prior note) */}
                          {latestHistoricalNote?.notes && (
                            <div className="mt-2.5 p-2.5 bg-amber-950/20 border border-amber-500/20 rounded-xl">
                              <div className="flex items-center justify-between text-[9px] text-amber-300/80 font-bold mb-0.5">
                                <span>CALLER NOTE (BY {latestHistoricalNote.caller_name.toUpperCase()})</span>
                                <span>{formatRelativeTime(latestHistoricalNote.called_at).toUpperCase()}</span>
                              </div>
                              <p className="text-xs text-zinc-200 line-clamp-2 italic leading-relaxed">
                                &ldquo;{latestHistoricalNote.notes}&rdquo;
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Locality & Pitch Needed Flag (Bug 6: 2-line clamp, never cut mid-word) */}
                        <div className="pt-2.5 flex items-center justify-between border-t border-white/[0.06] text-xs gap-2">
                          <div className="flex items-start gap-1.5 text-zinc-400 flex-1 min-w-0 pr-1">
                            <MapPin className="w-3.5 h-3.5 text-zinc-400 shrink-0 mt-0.5" />
                            <span className="text-[11px] leading-snug line-clamp-2 text-zinc-300">
                              {currentLead.address || currentLead.area || "Pune Metro"}
                            </span>
                          </div>
                          {!realWebsite && (
                            <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-md text-[10px] font-bold uppercase tracking-wider shrink-0">
                              Pitch Needed
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* BOTTOM COCKPIT ACTIONS */}
                    <div className="w-full flex flex-col gap-2 pt-2">
                      {/* Primary Action 1: DIAL BUTTON (Bug 3: Whitespace-nowrap phone number) */}
                      {readOnly ? (
                        <div className="w-full py-3.5 px-5 rounded-[22px] bg-zinc-900 border border-amber-500/30 text-amber-300 font-bold text-center text-xs">
                          Diagnostic Observer Mode Active (Dialing Disabled)
                        </div>
                      ) : (
                        <a
                          href={formatTelLink(currentLead.phone)}
                          onClick={handleDialClick}
                          className="w-full py-3.5 px-4 sm:px-5 rounded-[22px] bg-gradient-to-r from-[#F95721] via-orange-600 to-amber-600 text-white font-bold shadow-lg shadow-[#F95721]/30 flex items-center justify-between active:scale-[0.97] transition cursor-pointer relative overflow-hidden group"
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-black/25 flex items-center justify-center shadow-inner shrink-0">
                              <Phone className="w-4 h-4 sm:w-5 sm:h-5 text-white animate-pulse" />
                            </div>
                            <div className="text-left min-w-0">
                              <span className="text-[9px] uppercase font-black tracking-widest text-orange-200 block leading-tight whitespace-nowrap">
                                DIAL PRIMARY LINE
                              </span>
                              <span className="text-[15px] sm:text-[17px] font-black text-white tracking-normal font-mono tabular-nums leading-tight block whitespace-nowrap">
                                {formatPhoneDisplay(currentLead.phone)}
                              </span>
                            </div>
                          </div>
                          <div className="shrink-0 bg-black/30 backdrop-blur-sm border border-white/20 px-3 py-1.5 rounded-xl text-xs font-bold text-white flex items-center gap-1">
                            <span>Call</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </div>
                        </a>
                      )}

                      {/* Primary Action 2: SIDE-BY-SIDE (Log Outcome + Skip Lead >>) */}
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (readOnly) return;
                            setIsDispositionDrawerOpen(true);
                            playHapticTick(750, 0.02);
                          }}
                          disabled={readOnly}
                          className="w-full py-3 bg-[#1a1a20] hover:bg-[#23232b] text-white font-bold text-xs rounded-2xl border border-white/10 active:scale-[0.97] transition flex items-center justify-center gap-2 shadow-sm disabled:opacity-40"
                        >
                          <CheckCircle className="w-4 h-4 text-[#F95721]" />
                          <span>Log Outcome</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleSkipLead}
                          className="w-full py-3 bg-[#121216] hover:bg-[#18181c] text-zinc-400 hover:text-zinc-200 font-semibold text-xs rounded-2xl border border-white/[0.05] active:scale-[0.97] transition flex items-center justify-center gap-1.5"
                        >
                          <span>Skip Lead</span>
                          <span className="text-zinc-500 font-mono">››</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* SCREEN 3: LEAD DOSSIER (DETAIL VIEW) */}
            {activeScreen === "detail" && currentLead && (
              <div className="flex-1 flex flex-col justify-between overflow-y-auto pr-1">
                <div>
                  <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveScreen("cockpit");
                        playHapticTick(850, 0.02);
                      }}
                      className="flex items-center gap-1.5 text-xs text-[#F95721] font-bold active:scale-95 transition"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      <span>Back to Cockpit</span>
                    </button>
                    <span className="text-xs font-bold text-zinc-400">Lead Dossier & Audit</span>
                  </div>

                  <div className="pt-3 space-y-3 text-xs">
                    {/* Entity Card */}
                    <div className="bg-[#141418] border border-white/[0.08] p-4 rounded-2xl">
                      <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">
                        Business Entity
                      </span>
                      <h3 className="text-base font-bold text-white mt-1">
                        {formatLeadName(currentLead.name)}
                      </h3>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <span className="px-2 py-0.5 bg-zinc-800 text-zinc-300 rounded text-[11px]">
                          {currentLead.niche}
                        </span>
                        <span className="px-2 py-0.5 bg-zinc-800 text-zinc-300 rounded text-[11px]">
                          {currentLead.area}
                        </span>
                        {!realWebsite ? (
                          <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 rounded text-[11px]">
                            Pitch Needed
                          </span>
                        ) : (
                          <a
                            href={realWebsite.startsWith("http") ? realWebsite : `https://${realWebsite}`}
                            target="_blank"
                            rel="noreferrer"
                            className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded text-[11px] inline-flex items-center gap-1"
                          >
                            <span>Official Website</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Address Card */}
                    <div className="bg-[#141418] border border-white/[0.08] p-4 rounded-2xl">
                      <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">
                        Physical Address
                      </span>
                      <p className="text-zinc-300 mt-1 leading-relaxed">
                        {currentLead.address || currentLead.area || "No precise address recorded"}
                      </p>
                      <a
                        href={mapsUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-[#F95721] bg-[#F95721]/10 border border-[#F95721]/20 px-3.5 py-2 rounded-xl active:scale-95 transition"
                      >
                        <MapPin className="w-4 h-4" />
                        <span>Open in Google Maps</span>
                      </a>
                    </div>

                    {/* Historical Audit Thread */}
                    <div className="bg-[#141418] border border-white/[0.08] p-4 rounded-2xl">
                      <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">
                        Historical Audit Thread ({historicalLogs.length})
                      </span>
                      {loadingHistory ? (
                        <div className="py-4 flex items-center justify-center gap-2 text-zinc-400">
                          <Loader2 className="w-4 h-4 animate-spin text-[#F95721]" />
                          <span>Loading call audit...</span>
                        </div>
                      ) : historicalLogs.length === 0 ? (
                        <p className="text-zinc-500 mt-2 italic text-[11px]">
                          No previous call attempts logged for this lead.
                        </p>
                      ) : (
                        <div className="mt-2.5 space-y-2">
                          {historicalLogs.map((log) => (
                            <div
                              key={log.id}
                              className="p-3 bg-black/40 rounded-xl border border-white/[0.05]"
                            >
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="font-bold capitalize text-amber-400">
                                  {log.outcome.replace("_", " ")}
                                </span>
                                <span className="text-zinc-400">
                                  {formatRelativeTime(log.called_at)} • {log.caller_name}
                                </span>
                              </div>
                              {log.notes && (
                                <p className="text-zinc-300 mt-1 text-[11px] italic">
                                  &ldquo;{log.notes}&rdquo;
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setActiveScreen("cockpit");
                    playHapticTick(850, 0.02);
                  }}
                  className="w-full py-3.5 bg-zinc-800 text-white font-bold text-xs rounded-2xl mt-4 active:scale-95 transition"
                >
                  Done Reading
                </button>
              </div>
            )}

            {/* SCREEN 4: DAILY REPORT (TODAY SUMMARY) */}
            {activeScreen === "summary" && (
              <div className="flex-1 flex flex-col justify-between overflow-y-auto pr-1">
                <div>
                  <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveScreen("cockpit");
                        setActiveBottomNav("queue");
                        playHapticTick(850, 0.02);
                      }}
                      className="flex items-center gap-1.5 text-xs text-[#F95721] font-bold active:scale-95 transition"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      <span>Back to Queue</span>
                    </button>
                    <span className="text-xs font-bold text-zinc-400">Shift Performance</span>
                  </div>

                  <div className="pt-3 space-y-3">
                    {/* Top 3 KPI Cards */}
                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-[#141418] border border-white/[0.08] p-3 rounded-2xl text-center">
                        <span className="text-[10px] uppercase font-bold text-zinc-400">
                          Total Dials
                        </span>
                        <p className="text-xl font-black text-white mt-1 tabular-nums">
                          {shiftStats.totalDials}
                        </p>
                      </div>
                      <div className="bg-[#141418] border border-white/[0.08] p-3 rounded-2xl text-center">
                        <span className="text-[10px] uppercase font-bold text-zinc-400">Connects</span>
                        <p className="text-xl font-black text-emerald-400 mt-1 tabular-nums">
                          {shiftStats.connects}
                        </p>
                      </div>
                      <div className="bg-[#141418] border border-white/[0.08] p-3 rounded-2xl text-center">
                        <span className="text-[10px] uppercase font-bold text-zinc-400">Talk Time</span>
                        <p className="text-xl font-black text-[#F95721] mt-1 tabular-nums">
                          {formatHoursMinutes(shiftStats.totalTalkSeconds)}
                        </p>
                      </div>
                    </div>

                    {/* Outcomes Breakdown Grid */}
                    <div className="bg-[#141418] border border-white/[0.08] p-4 rounded-2xl">
                      <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">
                        Outcomes Logged Today
                      </span>
                      <div className="grid grid-cols-2 gap-2 mt-2.5 text-xs">
                        <div className="p-2.5 bg-black/40 rounded-xl flex items-center justify-between border border-emerald-500/20">
                          <span className="text-emerald-400 font-bold">🔥 Interested</span>
                          <span className="font-bold text-white tabular-nums">
                            {shiftStats.interested}
                          </span>
                        </div>
                        <div className="p-2.5 bg-black/40 rounded-xl flex items-center justify-between border border-amber-500/20">
                          <span className="text-amber-400 font-bold">📅 Callbacks</span>
                          <span className="font-bold text-white tabular-nums">
                            {shiftStats.callbacks}
                          </span>
                        </div>
                        <div className="p-2.5 bg-black/40 rounded-xl flex items-center justify-between border border-white/[0.05]">
                          <span className="text-zinc-400 font-bold">⏳ No Answer</span>
                          <span className="font-bold text-white tabular-nums">
                            {shiftStats.noAnswer}
                          </span>
                        </div>
                        <div className="p-2.5 bg-black/40 rounded-xl flex items-center justify-between border border-rose-500/20">
                          <span className="text-rose-400 font-bold">❌ Rejected</span>
                          <span className="font-bold text-white tabular-nums">
                            {shiftStats.rejected}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setActiveScreen("cockpit");
                    setActiveBottomNav("queue");
                    playHapticTick(900, 0.02);
                  }}
                  className="w-full py-3.5 bg-[#F95721] text-white font-bold text-xs rounded-2xl mt-4 active:scale-95 transition shadow-md shadow-[#F95721]/30"
                >
                  Resume Dialing
                </button>
              </div>
            )}

            {/* PIPELINE VIEW: CALLBACKS */}
            {activeScreen === "callbacks" && (
              <div className="flex-1 flex flex-col justify-between overflow-y-auto pr-1">
                <div>
                  <div className="flex items-center justify-between pb-2 border-b border-white/[0.06] mb-3">
                    <div>
                      <h3 className="text-sm font-bold text-white">Callbacks Scheduled</h3>
                      <p className="text-xs text-zinc-400">Strictly prioritized by appointment time</p>
                    </div>
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-bold">
                      {callbackLeads.length} Due
                    </span>
                  </div>

                  {callbackLeads.length === 0 ? (
                    <div className="py-12 text-center text-zinc-500 text-xs">
                      No callbacks currently scheduled.
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {callbackLeads.map((lead, idx) => (
                        <div
                          key={lead.id}
                          className="bg-[#141418] border border-white/[0.08] p-4 rounded-2xl flex flex-col gap-2"
                        >
                          <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                            {lead.next_callback_at
                              ? new Date(lead.next_callback_at).toLocaleTimeString("en-IN", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : "Pending Slot"}
                          </span>
                          <h4 className="text-sm font-bold text-white">
                            {formatLeadName(lead.name)}
                          </h4>
                          <p className="text-xs text-zinc-300">
                            {lead.address || lead.area} • {resolveDecisionMaker(lead)}
                          </p>
                          <div className="flex items-center justify-between pt-2 border-t border-white/[0.06] mt-1">
                            <span className="font-mono text-xs text-zinc-300 font-semibold">
                              {formatPhoneDisplay(lead.phone)}
                            </span>
                            {!readOnly && (
                              <a
                                href={formatTelLink(lead.phone)}
                                onClick={() => {
                                  setActiveLeadIndex(idx);
                                  handleDialClick();
                                }}
                                className="px-3 py-1.5 bg-[#F95721] hover:bg-orange-500 text-white font-bold text-xs rounded-xl active:scale-95 transition"
                              >
                                Dial Callback
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => handlePipelineTabSelect("dialNow")}
                  className="w-full py-3 bg-zinc-800 text-white font-semibold text-xs rounded-2xl mt-4"
                >
                  Return to Dial Now
                </button>
              </div>
            )}

            {/* PIPELINE VIEW: WAITING / COOLDOWNS */}
            {activeScreen === "waiting" && (
              <div className="flex-1 flex flex-col justify-between overflow-y-auto pr-1">
                <div>
                  <div className="flex items-center justify-between pb-2 border-b border-white/[0.06] mb-3">
                    <div>
                      <h3 className="text-sm font-bold text-white">Waiting & Cooldowns</h3>
                      <p className="text-xs text-zinc-400">Leads return to Dial Now once ready</p>
                    </div>
                    <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700 text-xs font-bold">
                      {waitingLeads.length} Leads
                    </span>
                  </div>

                  {waitingLeads.length === 0 ? (
                    <div className="py-12 text-center text-zinc-500 text-xs">
                      No leads currently in cadence cooldown.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {waitingLeads.map((lead) => (
                        <div
                          key={lead.id}
                          className="bg-[#141418] border border-white/[0.08] p-4 rounded-2xl flex items-center justify-between"
                        >
                          <div className="min-w-0 pr-2">
                            <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">
                              Cadence Cooldown
                            </span>
                            <h4 className="text-sm font-bold text-white mt-0.5 truncate">
                              {formatLeadName(lead.name)}
                            </h4>
                            <p className="text-xs text-zinc-400">
                              Attempt {lead.attempts_count || 1}/5 • {lead.area}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="text-xs font-mono font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded-lg tabular-nums">
                              {lead.cooldown_until
                                ? formatRelativeTime(lead.cooldown_until)
                                : "Soon"}
                            </span>
                            <span className="text-[10px] text-zinc-400 block mt-1">Remaining</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => handlePipelineTabSelect("dialNow")}
                  className="w-full py-3 bg-zinc-800 text-white font-semibold text-xs rounded-2xl mt-4"
                >
                  Return to Dial Now
                </button>
              </div>
            )}
          </main>

          {/* SCREEN 2: POST-CALL DISPOSITION DRAWER (SLIDE-UP SHEET) */}
          {isDispositionDrawerOpen && currentLead && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex flex-col justify-end animate-in fade-in duration-200">
              <div
                className="absolute inset-0"
                onClick={() => !isSubmitting && setIsDispositionDrawerOpen(false)}
              />

              <div className="relative w-full bg-[#141418] border-t border-white/10 rounded-t-[36px] p-5 shadow-2xl flex flex-col max-h-[92%] overflow-y-auto z-10 animate-in slide-in-from-bottom duration-300">
                <div className="w-12 h-1.5 bg-zinc-600 rounded-full mx-auto mb-3" />

                <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
                  <div>
                    <div className="flex items-center gap-1.5 text-xs text-[#F95721] font-bold">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span>
                        CALL CONCLUDED •{" "}
                        <span className="font-mono text-white tabular-nums">
                          {formatDurationTimer(callElapsedSeconds)}
                        </span>
                      </span>
                    </div>
                    <h3 className="text-sm font-black text-white mt-1 truncate max-w-[230px]">
                      {resolveDecisionMaker(currentLead)}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsDispositionDrawerOpen(false)}
                    className="text-xs text-zinc-400 hover:text-white px-2.5 py-1 bg-zinc-800 rounded-xl border border-white/[0.06] active:scale-95 transition"
                  >
                    Dismiss
                  </button>
                </div>

                {/* Quick Note Input with 1-Tap Chip Presets */}
                <div className="pt-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[10px] uppercase tracking-wider text-zinc-400 font-bold">
                      Quick Note / Context (Optional)
                    </label>
                    <span className="text-[10px] text-zinc-400">1-Tap Preset:</span>
                  </div>
                  <input
                    type="text"
                    value={quickNote}
                    onChange={(e) => setQuickNote(e.target.value)}
                    placeholder="e.g. Receptionist Pooja said doctor arrives at 4:30..."
                    className="w-full bg-[#121216] border border-white/[0.08] text-xs px-3.5 py-2.5 rounded-2xl text-white placeholder-zinc-500 focus:outline-none focus:border-[#F95721] transition"
                  />

                  {/* Preset Tags */}
                  <div className="flex items-center gap-1.5 mt-2 overflow-x-auto pb-1">
                    {["Surgeon in OT", "Call back after 4 PM", "Send WhatsApp deck", "In-house marketing"].map(
                      (tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => {
                            playHapticTick(1100, 0.015);
                            setQuickNote((prev) => (prev ? `${prev}. ${tag}` : tag));
                          }}
                          className="px-2.5 py-1 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 rounded-lg text-[11px] font-medium whitespace-nowrap active:scale-95 transition"
                        >
                          {tag}
                        </button>
                      )
                    )}
                  </div>
                </div>

                {/* 6 Outcome Buttons */}
                <div className="pt-3.5">
                  <span className="text-[10px] uppercase tracking-wider text-zinc-400 font-bold block mb-2">
                    Select Outcome (1-Tap Auto-Advance)
                  </span>

                  <div className="grid grid-cols-2 gap-2 text-xs font-semibold">
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => handleSubmitOutcome("interested", "done")}
                      className="p-3 bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-500/40 text-emerald-400 rounded-2xl flex items-center gap-2.5 active:scale-95 transition shadow-sm text-left"
                    >
                      <span className="text-xl">🔥</span>
                      <div>
                        <span className="block text-white leading-tight font-bold">Interested</span>
                        <span className="text-[10px] text-emerald-400 font-medium">Pitch accepted</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        playHapticTick(1000, 0.02);
                        setIsCallbackSubmenuOpen((prev) => !prev);
                      }}
                      className="p-3 bg-amber-950/40 hover:bg-amber-900/60 border border-amber-500/40 text-amber-400 rounded-2xl flex items-center gap-2.5 active:scale-95 transition shadow-sm text-left"
                    >
                      <span className="text-xl">📅</span>
                      <div>
                        <span className="block text-white leading-tight font-bold">Callback</span>
                        <span className="text-[10px] text-amber-400 font-medium">Set time...</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => handleSubmitOutcome("no_answer", "waiting")}
                      className="p-3 bg-[#16161b] hover:bg-[#202026] border border-white/[0.08] text-zinc-300 rounded-2xl flex items-center gap-2.5 active:scale-95 transition shadow-sm text-left"
                    >
                      <span className="text-xl">⏳</span>
                      <div>
                        <span className="block text-white leading-tight font-bold">No Answer</span>
                        <span className="text-[10px] text-zinc-400 font-medium">3-hr cooldown</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => handleSubmitOutcome("gatekeeper", "waiting")}
                      className="p-3 bg-[#16161b] hover:bg-[#202026] border border-white/[0.08] text-zinc-300 rounded-2xl flex items-center gap-2.5 active:scale-95 transition shadow-sm text-left"
                    >
                      <span className="text-xl">🛡️</span>
                      <div>
                        <span className="block text-white leading-tight font-bold">Gatekeeper</span>
                        <span className="text-[10px] text-zinc-400 font-medium">Staff blocked</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const reason = prompt("Enter Bad Fit / Rejection reason for quarantine holding:");
                        if (reason) {
                          setRejectionReason(reason);
                          handleSubmitOutcome("not_interested", "done");
                        }
                      }}
                      className="p-3 bg-rose-950/30 hover:bg-rose-900/50 border border-rose-500/30 text-rose-300 rounded-2xl flex items-center gap-2.5 active:scale-95 transition shadow-sm text-left"
                    >
                      <span className="text-xl">❌</span>
                      <div>
                        <span className="block text-white leading-tight font-bold">Rejected</span>
                        <span className="text-[10px] text-rose-400 font-medium">Not interested</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const confirmDnc = confirm(
                          "Confirm Do Not Call (DNC)? This permanently blacklists this phone number hash."
                        );
                        if (confirmDnc) {
                          setDncConfirmed(true);
                          handleSubmitOutcome("dnc", "done");
                        }
                      }}
                      className="p-3 bg-zinc-900 hover:bg-zinc-800 border border-white/[0.05] text-zinc-400 rounded-2xl flex items-center gap-2.5 active:scale-95 transition shadow-sm text-left"
                    >
                      <span className="text-xl">⚫</span>
                      <div>
                        <span className="block text-zinc-300 leading-tight font-bold">DNC</span>
                        <span className="text-[10px] text-zinc-500 font-medium">Remove lead</span>
                      </div>
                    </button>
                  </div>

                  {/* Callback Submenu */}
                  {isCallbackSubmenuOpen && (
                    <div className="mt-3 p-3 bg-amber-950/30 border border-amber-500/30 rounded-2xl space-y-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 block">
                        Select Callback Slot
                      </span>
                      <div className="grid grid-cols-3 gap-1.5 text-xs font-semibold">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedCallbackSlot("+30m");
                            handleSubmitOutcome("callback", "callbacks");
                          }}
                          className="py-2 bg-amber-500/20 text-amber-300 rounded-xl hover:bg-amber-500/30 active:scale-95 transition"
                        >
                          +30 Mins
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedCallbackSlot("today_430");
                            handleSubmitOutcome("callback", "callbacks");
                          }}
                          className="py-2 bg-amber-500/20 text-amber-300 rounded-xl hover:bg-amber-500/30 active:scale-95 transition"
                        >
                          4:30 PM Today
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedCallbackSlot("tomorrow_10");
                            handleSubmitOutcome("callback", "callbacks");
                          }}
                          className="py-2 bg-amber-500/20 text-amber-300 rounded-xl hover:bg-amber-500/30 active:scale-95 transition"
                        >
                          Tomorrow 10 AM
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <p className="text-[10px] text-zinc-400 text-center mt-3">
                  Tapping outcome saves note, updates pipeline, and crossfades to next lead.
                </p>
              </div>
            </div>
          )}

          {/* SCREEN 5: DECK QUEUE SHEET */}
          {isDeckQueueOpen && (
            <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex flex-col justify-end animate-in fade-in duration-150">
              <div
                className="absolute inset-0"
                onClick={() => setIsDeckQueueOpen(false)}
              />
              <div className="relative w-full bg-[#141418] border-t border-white/10 rounded-t-[36px] p-5 shadow-2xl flex flex-col max-h-[85%] z-10 animate-in slide-in-from-bottom duration-200">
                <div className="w-12 h-1.5 bg-zinc-600 rounded-full mx-auto mb-3" />
                <div className="flex items-center justify-between pb-3 border-b border-white/[0.08] mb-3">
                  <div>
                    <h3 className="text-sm font-bold text-white">Upcoming Deck Queue</h3>
                    <p className="text-xs text-zinc-400">Leads in rotation</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsDeckQueueOpen(false)}
                    className="text-zinc-400 hover:text-white p-1"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-2 text-xs overflow-y-auto max-h-[50vh]">
                  {dialNowLeads.slice(0, 10).map((lead, idx) => (
                    <div
                      key={lead.id}
                      onClick={() => {
                        setActiveLeadIndex(idx);
                        setIsDeckQueueOpen(false);
                        playHapticTick(900, 0.02);
                      }}
                      className={`p-3 rounded-2xl flex items-center justify-between cursor-pointer active:scale-98 transition ${
                        idx === activeLeadIndex
                          ? "bg-[#18181f] border border-[#F95721]/50 shadow-sm"
                          : "bg-[#121216] border border-white/[0.05]"
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <span className="text-[10px] text-[#F95721] font-bold uppercase tracking-wider">
                          Queue #{idx + 1}
                        </span>
                        <h4 className="font-bold text-white text-xs mt-0.5 truncate">
                          {formatLeadName(lead.name)}
                        </h4>
                        <p className="text-zinc-400 text-[11px] truncate">
                          {lead.area} • Attempt {lead.attempts_count || 1}/5
                        </p>
                      </div>
                      <span className="text-xs bg-[#F95721]/20 text-[#F95721] border border-[#F95721]/30 px-2.5 py-1 rounded-lg font-bold shrink-0">
                        {idx === activeLeadIndex ? "Active" : "Jump"}
                      </span>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setIsDeckQueueOpen(false)}
                  className="w-full mt-4 py-3 bg-zinc-800 text-zinc-300 font-bold text-xs rounded-2xl"
                >
                  Close Queue
                </button>
              </div>
            </div>
          )}

          {/* PROFILE / LOGOUT SHEET */}
          {isProfileSheetOpen && (
            <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex flex-col justify-end animate-in fade-in duration-150">
              <div
                className="absolute inset-0"
                onClick={() => setIsProfileSheetOpen(false)}
              />
              <div className="relative w-full bg-[#141418] border-t border-white/10 rounded-t-[36px] p-5 shadow-2xl flex flex-col z-10 animate-in slide-in-from-bottom duration-200">
                <div className="w-12 h-1.5 bg-zinc-600 rounded-full mx-auto mb-3" />
                <div className="flex items-center justify-between pb-3 border-b border-white/[0.08] mb-3">
                  <div>
                    <h3 className="text-sm font-bold text-white">Caller Profile & Settings</h3>
                    <p className="text-xs text-zinc-400">Account details & session control</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsProfileSheetOpen(false)}
                    className="text-zinc-400 hover:text-white p-1"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="p-3.5 bg-[#121216] border border-white/[0.06] rounded-2xl flex items-center justify-between">
                    <div>
                      <p className="font-bold text-white text-sm">
                        {currentUserProfile?.full_name || "Caller"}
                      </p>
                      <p className="text-zinc-400 text-[11px] mt-0.5">
                        {currentUserProfile?.email || "caller@pinsite.pro"}
                      </p>
                    </div>
                    <span className="px-2.5 py-1 bg-[#F95721]/15 text-[#F95721] border border-[#F95721]/30 rounded-full font-mono text-[10px] font-bold uppercase">
                      {currentUserProfile?.role || "CALLER"}
                    </span>
                  </div>

                  <div className="p-3 bg-[#121216] border border-white/[0.06] rounded-2xl flex items-center justify-between">
                    <span className="text-zinc-300 font-medium">Session Status</span>
                    <span className="text-emerald-400 font-bold inline-flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      Active / Dial Ready
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={async () => {
                      await supabase.auth.signOut();
                      router.push("/login");
                    }}
                    className="w-full mt-2 py-3.5 bg-rose-600/20 hover:bg-rose-600/30 border border-rose-500/40 text-rose-300 font-bold text-xs rounded-2xl flex items-center justify-center gap-2 active:scale-95 transition"
                  >
                    <LogOut className="w-4 h-4 text-rose-400" />
                    <span>Log Out of Pinsite</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* PERSISTENT FOOTER STRIP (Sits DIRECTLY ABOVE Bottom Nav) */}
          <div className="w-full px-5 py-2 bg-[#09090c] border-t border-white/[0.04] flex items-center justify-between text-xs text-zinc-400 z-20 shrink-0">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="font-mono text-[10px] text-zinc-300 font-medium">
                Queue Active · Dial Ready
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setActiveScreen("summary");
                setActiveBottomNav("today");
                playHapticTick(850, 0.02);
              }}
              className="text-[#F95721] hover:text-orange-300 font-bold text-[10px] flex items-center gap-1 active:scale-95 transition"
            >
              <span>Shift: {shiftStats.totalDials} Dials</span>
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>

          {/* CALLER BOTTOM NAVIGATION BAR (4 TABS ONLY - SOLE AND EXCLUSIVE NAV) */}
          <nav className="w-full bg-[#101014] border-t border-white/[0.08] px-4 py-2 z-20 shrink-0 grid grid-cols-4 gap-1 text-center">
            {/* 1. Queue */}
            <button
              type="button"
              onClick={() => handleBottomNavClick("queue")}
              className={`flex flex-col items-center justify-center py-1 transition ${
                activeBottomNav === "queue" && activeScreen === "cockpit"
                  ? "text-[#F95721]"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Phone className="w-4 h-4" />
              <span className="text-[10px] font-bold mt-0.5">Queue</span>
            </button>

            {/* 2. Comms */}
            <button
              type="button"
              onClick={() => handleBottomNavClick("comms")}
              className="relative flex flex-col items-center justify-center py-1 text-zinc-400 hover:text-zinc-200 transition"
            >
              <div className="relative">
                <MessageSquare className="w-4 h-4" />
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#F95721]" />
              </div>
              <span className="text-[10px] font-medium mt-0.5">Comms</span>
            </button>

            {/* 3. Today (Shift Summary) */}
            <button
              type="button"
              onClick={() => handleBottomNavClick("today")}
              className={`flex flex-col items-center justify-center py-1 transition ${
                activeBottomNav === "today" || activeScreen === "summary"
                  ? "text-[#F95721]"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Calendar className="w-4 h-4" />
              <span className="text-[10px] font-medium mt-0.5">Today</span>
            </button>

            {/* 4. Profile */}
            <button
              type="button"
              onClick={() => handleBottomNavClick("profile")}
              className={`flex flex-col items-center justify-center py-1 transition ${
                isProfileSheetOpen ? "text-[#F95721]" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <User className="w-4 h-4" />
              <span className="text-[10px] font-medium mt-0.5">Profile</span>
            </button>
          </nav>
        </>
      )}
    </div>
  );
}
