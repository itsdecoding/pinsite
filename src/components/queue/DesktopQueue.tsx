"use client";

import React, { useEffect, useState, useCallback, useRef, useMemo, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Phone,
  PhoneCall,
  Clock,
  Globe,
  MapPin,
  Calendar,
  Sparkles,
  ChevronRight,
  ShieldCheck,
  CheckCircle,
  AlertTriangle,
  Loader2,
  FileText,
  MessageSquare,
  Wifi,
  WifiOff,
  User,
  Users,
  Layers,
  RefreshCw,
  ExternalLink,
  ChevronDown,
  Copy,
  Check,
  Eye,
  X,
  CalendarClock,
  ShieldAlert,
  Flame,
  CheckCircle2,
  XCircle,
  Lock,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { EntityComments } from "@/components/comms/EntityComments";
import { get, set } from "idb-keyval";
import { QueueKanban, KanbanLead } from "./QueueKanban";

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

interface CallerInfo {
  id: string;
  full_name: string;
  lead_count: number;
}

interface CallLogSummary {
  notes: string | null;
  outcome: string;
  called_at: string;
  caller_name?: string;
}

const OUTCOMES = [
  { key: "1", label: "Interested (Hot)", value: "interested", icon: "🔥", desc: "Ready for pitch / close" },
  { key: "2", label: "Callback", value: "callback", icon: "📞", desc: "Schedule follow-up date & time" },
  { key: "3", label: "No Answer", value: "no_answer", icon: "⏳", desc: "Cadence cooldown (3h / 24h / 48h / 72h)" },
  { key: "4", label: "Gatekeeper", value: "gatekeeper", icon: "🛡️", desc: "Blocked by gatekeeper (48h cooldown)" },
  { key: "5", label: "Rejected / Bad Fit", value: "not_interested", icon: "❌", desc: "Send to quarantine (enter reason)" },
  { key: "6", label: "DNC", value: "dnc", icon: "🚫", desc: "Blacklist phone number permanently" },
];

type QueueScope = "all" | "unassigned" | "assigned" | "mine" | string;

/**
 * Normalizes phone number to strict E.164 tel: URI (+91 for Indian numbers)
 */
function formatTelLink(phone: string | null | undefined): string {
  if (!phone) return "";
  const cleaned = phone.trim();
  if (cleaned.startsWith("+91")) {
    return `tel:+91${cleaned.slice(3).replace(/\D/g, "")}`;
  }
  const digits = cleaned.replace(/\D/g, "");
  // If 11 digits starting with 0 (e.g. 09226414192)
  if (digits.length === 11 && digits.startsWith("0")) {
    return `tel:+91${digits.slice(1)}`;
  }
  // If 12 digits starting with 91 (e.g. 919226414192)
  if (digits.length === 12 && digits.startsWith("91")) {
    return `tel:+${digits}`;
  }
  // If 10 digits standard mobile (e.g. 9226414192)
  if (digits.length === 10) {
    return `tel:+91${digits}`;
  }
  // Fallback
  return `tel:${cleaned.startsWith("+") ? cleaned : `+91${digits}`}`;
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

/**
 * Formats timestamps into human relative string (e.g. "Just now", "2h ago", "Yesterday")
 */
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

/**
 * Resolves the decision maker name, dynamically extracting from business name if unassigned
 */
function resolveDecisionMaker(lead: Lead): string {
  if (lead.decision_maker && lead.decision_maker.trim()) {
    return lead.decision_maker.trim();
  }
  // Smart extraction: e.g. "Dr.Archana's Aesthetic Dental Clinic" -> "Dr. Archana — Principal Doctor / Owner"
  const match = lead.name.match(/^(Dr\.?\s*[A-Za-z]+('s)?)/i);
  if (match) {
    const docName = match[1].replace(/'s$/i, "").replace(/^Dr\.?/i, "Dr. ");
    return `${docName.trim()} — Owner / Lead Doctor`;
  }
  return "Owner / Managing Director";
}

/**
 * Normalizes and formats lead names cleanly for data hygiene:
 * - Fixes "Dr.Archana" -> "Dr. Archana"
 * - Fixes "Dr Phadatare" -> "Dr. Phadatare"
 * - Fixes "Dr Namrata's-Samarth" -> "Dr. Namrata's - Samarth"
 * - Normalizes spacing
 */
function formatLeadName(rawName: string | null | undefined): string {
  if (!rawName) return "Unnamed Lead";
  let name = rawName.trim();
  name = name.replace(/([a-zA-Z0-9'’])\s*-\s*([a-zA-Z0-9])/g, "$1 - $2");
  name = name.replace(/\bDr\.([A-Za-z])/gi, "Dr. $1");
  name = name.replace(/\bDr(?!\.)\s+/gi, "Dr. ");
  name = name.replace(/\s+/g, " ").trim();
  return name;
}

/**
 * Formats seconds into MM:SS call duration timer
 */
function formatDurationTimer(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function DesktopQueueMain() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [totalPoolCount, setTotalPoolCount] = useState<number | null>(null);
  const [unassignedPoolCount, setUnassignedPoolCount] = useState<number>(0);
  const [activeLeadIndex, setActiveLeadIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [callActive, setCallActive] = useState(false);
  const [callStartTime, setCallStartTime] = useState<number | null>(null);
  const [callElapsedSeconds, setCallElapsedSeconds] = useState(0);
  const [selectedOutcome, setSelectedOutcome] = useState<string>("no_answer");
  const [callNotes, setCallNotes] = useState("");
  const [callbackDateTime, setCallbackDateTime] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [dncConfirmed, setDncConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [userRole, setUserRole] = useState<string>("caller");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [queueScope, setQueueScope] = useState<QueueScope>("all");
  const [callersList, setCallersList] = useState<CallerInfo[]>([]);
  const [isReassigning, setIsReassigning] = useState(false);
  const [impersonatedCaller, setImpersonatedCaller] = useState<{
    id: string;
    full_name: string;
    is_online: boolean;
    dials_today: number;
  } | null>(null);
  const [adminFullName, setAdminFullName] = useState<string>("Manager");
  const [adminActionsCount, setAdminActionsCount] = useState<number>(0);
  const [isMirrorDetailsOpen, setIsMirrorDetailsOpen] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [latestCallNote, setLatestCallNote] = useState<CallLogSummary | null>(null);
  const [loadingNote, setLoadingNote] = useState(false);

  const searchParams = useSearchParams();
  const router = useRouter();
  const impersonateParam = searchParams.get("impersonate");
  const viewParam = searchParams.get("view");
  const [activeView, setActiveView] = useState<"deck" | "kanban">(
    viewParam === "kanban" ? "kanban" : "deck"
  );

  const handleSelectFromKanban = (kanbanLead: KanbanLead) => {
    const existingIdx = leads.findIndex((l) => l.id === kanbanLead.id);
    if (existingIdx !== -1) {
      setActiveLeadIndex(existingIdx);
    } else {
      const convertedLead: Lead = {
        id: kanbanLead.id,
        name: kanbanLead.name,
        phone: kanbanLead.phone,
        normalized_phone: kanbanLead.normalized_phone || kanbanLead.phone,
        website: kanbanLead.website,
        has_website: Boolean(kanbanLead.has_website),
        address: kanbanLead.address,
        niche: kanbanLead.niche,
        area: kanbanLead.area,
        score: kanbanLead.score,
        status: kanbanLead.status,
        assigned_to: kanbanLead.assigned_to || null,
        attempts_count: kanbanLead.attempts_count || 0,
        next_callback_at: kanbanLead.next_callback_at || null,
        last_called_at: kanbanLead.last_called_at || null,
        cooldown_until: kanbanLead.cooldown_until || null,
        profiles: kanbanLead.profiles,
      };
      setLeads((prev) => [convertedLead, ...prev]);
      setActiveLeadIndex(0);
    }
    setActiveView("deck");
  };

  const supabase = createClient();
  const notesInputRef = useRef<HTMLTextAreaElement>(null);
  const callActiveRef = useRef(callActive);
  const isDrawerOpenRef = useRef(isDrawerOpen);
  const currentLeadRef = useRef<Lead | null>(null);

  useEffect(() => {
    callActiveRef.current = callActive;
  }, [callActive]);

  useEffect(() => {
    isDrawerOpenRef.current = isDrawerOpen;
  }, [isDrawerOpen]);

  const currentLead = leads[activeLeadIndex] || null;

  useEffect(() => {
    currentLeadRef.current = currentLead;
  }, [currentLead]);

  // Live Call Duration Timer: counts seconds in real time when callActive is true
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (callActive && callStartTime) {
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
  }, [callActive, callStartTime]);

  // Fetch the most recent call note for the active lead
  useEffect(() => {
    if (!currentLead) {
      setLatestCallNote(null);
      return;
    }
    let isCurrent = true;
    setLoadingNote(true);

    async function fetchLatestCall() {
      try {
        const { data } = await supabase
          .from("calls")
          .select("notes, outcome, called_at, profiles:caller_id(full_name)")
          .eq("lead_id", currentLead!.id)
          .order("called_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!isCurrent) return;

        if (data) {
          setLatestCallNote({
            notes: data.notes || null,
            outcome: data.outcome,
            called_at: data.called_at,
            caller_name: (data.profiles as any)?.full_name || "Caller",
          });
        } else {
          setLatestCallNote(null);
        }
      } catch {
        if (isCurrent) setLatestCallNote(null);
      } finally {
        if (isCurrent) setLoadingNote(false);
      }
    }

    fetchLatestCall();
    return () => {
      isCurrent = false;
    };
  }, [currentLead?.id, supabase]);

  // Sync offline queue when network reconnects
  const syncOfflineQueue = useCallback(async () => {
    try {
      const offlineQueue = (await get("offline_call_queue")) || [];
      if (!Array.isArray(offlineQueue) || offlineQueue.length === 0) return;

      const remainingQueue = [];
      for (const item of offlineQueue) {
        try {
          const res = await fetch("/api/queue/outcome", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(item),
          });
          if (!res.ok) {
            remainingQueue.push(item);
          }
        } catch {
          remainingQueue.push(item);
        }
      }
      await set("offline_call_queue", remainingQueue);
    } catch (err) {
      console.warn("Failed to sync offline queue:", err);
    }
  }, []);

  const loadLeads = useCallback(
    async (scopeOverride?: QueueScope, silent: boolean = false) => {
      if (!silent) setLoading(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          const cached = await get("cached_leads");
          if (cached && Array.isArray(cached)) setLeads(cached);
          if (!silent) setLoading(false);
          return;
        }

        setCurrentUserId(user.id);

        // 1. Fetch user role & admin name
        const { data: profile } = await supabase
          .from("profiles")
          .select("role, full_name")
          .eq("id", user.id)
          .maybeSingle();

        const role = profile?.role || "caller";
        setUserRole(role);
        if (profile?.full_name) {
          const cleanName = profile.full_name.replace(/\s*\((?:Admin|Manager|Owner|Caller|Developer)\)/gi, "").trim();
          setAdminFullName(cleanName || "Manager");
        }

        // 2. Resolve impersonation (Mirror Mode) if admin or manager
        let activeImpersonation: { id: string; full_name: string; is_online: boolean; dials_today: number } | null = null;
        if (impersonateParam && (role === "admin" || role === "manager")) {
          const { data: callerData } = await supabase
            .from("profiles")
            .select("id, full_name, role, is_available, active")
            .eq("id", impersonateParam)
            .maybeSingle();

          if (callerData) {
            // Calculate start of day in Asia/Kolkata (IST: UTC+5:30) identically to team-stats
            const istOffsetMs = 5.5 * 60 * 60 * 1000;
            const istNow = new Date(Date.now() + istOffsetMs);
            const istDateStr = istNow.toISOString().split("T")[0]; // YYYY-MM-DD
            const istStartUtc = new Date(new Date(`${istDateStr}T00:00:00.000Z`).getTime() - istOffsetMs).toISOString();

            const { count: dialsToday } = await supabase
              .from("calls")
              .select("*", { count: "exact", head: true })
              .eq("caller_id", callerData.id)
              .gte("called_at", istStartUtc);

            activeImpersonation = {
              id: callerData.id,
              full_name: callerData.full_name,
              is_online: Boolean(callerData.active && callerData.is_available),
              dials_today: dialsToday || 0,
            };
            setImpersonatedCaller(activeImpersonation);
          } else {
            setImpersonatedCaller(null);
          }
        } else {
          setImpersonatedCaller(null);
        }

        // 3. Check total pool & unassigned counts (strictly excluding closed, dnc, not_interested, and interested)
        const { count: poolCount } = await supabase
          .from("leads")
          .select("*", { count: "exact", head: true })
          .is("deleted_at", null)
          .not("status", "in", '("closed_won","closed_lost","dnc","not_interested","interested")');

        setTotalPoolCount(poolCount || 0);

        const { count: unassignedCount } = await supabase
          .from("leads")
          .select("*", { count: "exact", head: true })
          .is("deleted_at", null)
          .is("assigned_to", null)
          .not("status", "in", '("closed_won","closed_lost","dnc","not_interested","interested")');

        setUnassignedPoolCount(unassignedCount || 0);

        // 4. For Managers/Admins: Fetch active callers list and count their assigned leads
        if (role === "admin" || role === "manager") {
          const { data: callers } = await supabase
            .from("profiles")
            .select("id, full_name")
            .eq("role", "caller")
            .eq("active", true)
            .order("full_name", { ascending: true });

          const { data: assignedLeadsData } = await supabase
            .from("leads")
            .select("assigned_to")
            .is("deleted_at", null)
            .not("status", "in", '("closed_won","closed_lost","dnc","not_interested","interested")')
            .not("assigned_to", "is", null);

          const counts: Record<string, number> = {};
          (assignedLeadsData || []).forEach((l) => {
            if (l.assigned_to) {
              counts[l.assigned_to] = (counts[l.assigned_to] || 0) + 1;
            }
          });

          setCallersList(
            (callers || []).map((c) => ({
              id: c.id,
              full_name: c.full_name,
              lead_count: counts[c.id] || 0,
            }))
          );
        }

        const activeScope = scopeOverride || queueScope;
        const nowIso = new Date().toISOString();

        // 5. Build query based on role, mirror mode, and scope
        // Strictly exclude not_interested, closed, dnc, and interested (deals/prospects)
        const buildLeadQuery = (includeCooldown: boolean) => {
          let q = supabase
            .from("leads")
            .select("*, profiles:assigned_to(full_name)")
            .is("deleted_at", null)
            .not("status", "in", '("closed_won","closed_lost","dnc","not_interested","interested")');

          if (includeCooldown) {
            q = q.or(`cooldown_until.is.null,cooldown_until.lte.${nowIso}`);
          }

          if (activeImpersonation) {
            q = q.eq("assigned_to", activeImpersonation.id);
          } else if (role === "caller") {
            q = q.eq("assigned_to", user.id);
          } else {
            if (activeScope === "mine") {
              q = q.eq("assigned_to", user.id);
            } else if (activeScope === "unassigned") {
              q = q.is("assigned_to", null);
            } else if (activeScope === "assigned") {
              q = q.not("assigned_to", "is", null);
            } else if (activeScope.startsWith("caller_")) {
              const specificCallerId = activeScope.replace("caller_", "");
              q = q.eq("assigned_to", specificCallerId);
            }
          }

          return q
            .order("next_callback_at", { ascending: true, nullsFirst: false })
            .order("score", { ascending: false });
        }

        let { data, error } = await buildLeadQuery(true);
        if (error && (error.message?.includes("cooldown_until") || error.code === "42703")) {
          // Column does not exist yet prior to migration; retry without cooldown filter
          const retryRes = await buildLeadQuery(false);
          data = retryRes.data;
          error = retryRes.error;
        }

        if (error) throw error;

        if (data && data.length > 0) {
          setLeads(data);
          // If silent refresh and user was viewing a lead, preserve current lead index if possible
          if (silent && currentLeadRef.current) {
            const preservedIdx = data.findIndex((l) => l.id === currentLeadRef.current?.id);
            if (preservedIdx !== -1) {
              setActiveLeadIndex(preservedIdx);
            } else {
              setActiveLeadIndex((prev) => Math.min(prev, data.length - 1));
            }
          } else if (!silent) {
            setActiveLeadIndex(0);
          }
          await set("cached_leads", data);
        } else {
          setLeads([]);
          setActiveLeadIndex(0);
        }
      } catch (err: any) {
        console.warn("Fallback to offline cache:", err);
        const cached = await get("cached_leads");
        if (cached && Array.isArray(cached)) setLeads(cached);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [supabase, queueScope, impersonateParam]
  );

  // Initial lead fetch and connectivity listeners
  useEffect(() => {
    loadLeads();

    const handleOnline = () => {
      setIsOnline(true);
      syncOfflineQueue();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    setIsOnline(navigator.onLine);

    if (navigator.onLine) {
      syncOfflineQueue();
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [loadLeads, syncOfflineQueue]);

  // 60-Second Cooldown Interval Refresh: automatically check if cooldowns have expired
  useEffect(() => {
    const intervalId = setInterval(() => {
      // Don't interrupt if user is actively logging or on a call
      if (!isDrawerOpenRef.current && !callActiveRef.current) {
        loadLeads(undefined, true);
      }
    }, 60000);

    return () => clearInterval(intervalId);
  }, [loadLeads]);

  const handleScopeChange = (newScope: QueueScope) => {
    setQueueScope(newScope);
    loadLeads(newScope);
  };

  const handleExitMirrorMode = () => {
    setImpersonatedCaller(null);
    router.push("/studio/manager/team");
  };

  const handleReassignLead = async (leadId: string, newCallerId: string) => {
    setIsReassigning(true);
    try {
      const res = await fetch("/api/queue/reassign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: leadId,
          caller_id: newCallerId || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reassign lead");

      setAdminActionsCount((prev) => prev + 1);

      // Update lead in memory
      const targetCaller = callersList.find((c) => c.id === newCallerId);
      setLeads((prev) =>
        prev.map((l) =>
          l.id === leadId
            ? {
                ...l,
                assigned_to: newCallerId || null,
                profiles: targetCaller ? { full_name: targetCaller.full_name } : null,
              }
            : l
        )
      );

      // Refresh stats
      await loadLeads();
    } catch (err: any) {
      alert(`Reassign error: ${err.message}`);
    } finally {
      setIsReassigning(false);
    }
  };

  const handleStartCall = () => {
    if (!currentLead) return;
    setCallActive(true);
    setCallStartTime(Date.now());
    setIsDrawerOpen(true);
    setSelectedOutcome("no_answer");
    setCallNotes("");
    setCallbackDateTime("");
    setRejectionReason("");
    setDncConfirmed(false);
  };

  const handleSubmitOutcome = async () => {
    if (!currentLead || isSubmitting) return;

    if (selectedOutcome === "dnc" && !dncConfirmed) {
      alert("Please confirm the Do Not Call (DNC) request before submitting.");
      return;
    }

    if (selectedOutcome === "not_interested" && !rejectionReason.trim()) {
      alert("Please enter a rejection reason before logging Bad Fit / Rejected.");
      return;
    }

    setIsSubmitting(true);
    const duration = callStartTime ? Math.round((Date.now() - callStartTime) / 1000) : 0;
    const clientOfflineId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : undefined;

    const payload: Record<string, any> = {
      p_lead_id: currentLead.id,
      p_status: selectedOutcome,
      p_callback_at: selectedOutcome === "callback" && callbackDateTime ? callbackDateTime : null,
      p_notes: callNotes.trim() || null,
      p_duration_seconds: duration,
      p_client_offline_id: clientOfflineId,
      p_rejection_reason: selectedOutcome === "not_interested" ? (rejectionReason.trim() || "Rejected by caller") : null,
    };

    if (impersonatedCaller) {
      payload.p_impersonate_caller_id = impersonatedCaller.id;
    }

    try {
      if (isOnline) {
        const res = await fetch("/api/queue/outcome", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to log call outcome");
      } else {
        const queue = (await get("offline_call_queue")) || [];
        queue.push({ ...payload, timestamp: new Date().toISOString() });
        await set("offline_call_queue", queue);
      }

      setTimeout(() => {
        setIsDrawerOpen(false);
        setCallActive(false);
        setCallStartTime(null);
        setRejectionReason("");
        setDncConfirmed(false);
        setIsSubmitting(false);

        // Remove lead from active queue
        setLeads((prev) => {
          const updated = prev.filter((_, idx) => idx !== activeLeadIndex);
          if (activeLeadIndex >= updated.length && updated.length > 0) {
            setActiveLeadIndex(updated.length - 1);
          }
          return updated;
        });
      }, 120);
    } catch (err: any) {
      alert(`Error updating call: ${err.message}`);
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === "TEXTAREA" || target.tagName === "INPUT" || target.tagName === "SELECT") {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          handleSubmitOutcome();
        }
        return;
      }

      if (e.code === "Space" && !isDrawerOpen) {
        e.preventDefault();
        if (currentLead) {
          handleStartCall();
          window.location.href = formatTelLink(currentLead.phone);
        }
        return;
      }

      if (isDrawerOpen) {
        const match = OUTCOMES.find((o) => o.key === e.key);
        if (match) {
          e.preventDefault();
          setSelectedOutcome(match.value);
        } else if (e.key === "Enter") {
          e.preventDefault();
          handleSubmitOutcome();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isDrawerOpen, currentLead, selectedOutcome, callNotes, callbackDateTime, rejectionReason, dncConfirmed]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-[#6E6B66] dark:text-[#8A8680]">
        <Loader2 className="w-8 h-8 animate-spin text-[#F95721]" />
        <p className="text-xs font-mono uppercase tracking-wider">Syncing Outbound Deck...</p>
      </div>
    );
  }

  const isManagement = userRole === "admin" || userRole === "manager";

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
    <div className="space-y-6 max-w-full overflow-x-hidden pb-24 md:pb-8">
      {/* Sleek Compact Header Bar (Zero wasted vertical space) */}
      <div className="flex items-center justify-between gap-3 pt-1 pb-1 flex-wrap">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="text-xs font-mono tracking-wider uppercase text-[#F95721] font-bold">
            {isManagement ? "OUTBOUND DECK" : "DIAL QUEUE"}
          </span>
          {isManagement && (
            <span className="px-2 py-0.5 rounded-full bg-[#F95721]/10 text-[#F95721] text-[10px] font-mono font-bold border border-[#F95721]/20">
              {userRole.toUpperCase()}
            </span>
          )}

          {/* Primary View Navigation Switcher (Rule: 2-4 options, switched frequently -> visible tabs/pills) */}
          <div className="flex items-center p-0.5 rounded-full bg-black/5 dark:bg-white/5 border border-[#ECE8E1] dark:border-[#2D2924] ml-1 shadow-sm">
            <button
              type="button"
              onClick={() => setActiveView("deck")}
              className={`px-3 py-1 rounded-full text-xs font-mono font-bold transition-all flex items-center gap-1.5 ${
                activeView === "deck"
                  ? "bg-[#F95721] text-white shadow-sm"
                  : "text-[#6E6B66] dark:text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF]"
              }`}
            >
              <PhoneCall className="w-3.5 h-3.5" />
              <span>Dial Deck</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveView("kanban")}
              className={`px-3 py-1 rounded-full text-xs font-mono font-bold transition-all flex items-center gap-1.5 ${
                activeView === "kanban"
                  ? "bg-[#F95721] text-white shadow-sm"
                  : "text-[#6E6B66] dark:text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF]"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Transparent Kanban</span>
            </button>
          </div>

          {/* Caller's Queue Number moved directly into the header bar (when viewing deck) */}
          {activeView === "deck" && leads.length > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F95721]/10 text-[#F95721] border border-[#F95721]/20 text-xs font-mono font-bold shadow-sm">
              <span>Lead {activeLeadIndex + 1} of {leads.length}</span>
            </span>
          )}

          {/* Admin/Manager-Only Scope Filter Dropdown (Strictly hidden from callers, shown in deck mode) */}
          {isManagement && !impersonatedCaller && activeView === "deck" && (
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
          {/* Subtle Figma/Linear-style Mirror Mode Pill & Popover (when impersonating) */}
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
                  MIRRORING • {impersonatedCaller.full_name} • {impersonatedCaller.dials_today} dials • {leads.length} ready to dial
                </span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isMirrorDetailsOpen ? "rotate-180" : ""}`} />
              </button>

              {/* Expanded detail popover card (Linear/Figma style) */}
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
                    {/* Status & Output */}
                    <div className="p-2.5 rounded-2xl bg-black/5 dark:bg-white/5 space-y-1">
                      <div className="flex items-center justify-between font-mono text-[11px]">
                        <span className="text-[#8A8680]">Caller Status:</span>
                        <span className="inline-flex items-center gap-1 font-bold text-[#111110] dark:text-[#F5F3EF]">
                          <span className={`w-2 h-2 rounded-full ${impersonatedCaller.is_online ? "bg-emerald-500" : "bg-stone-400"}`} />
                          {impersonatedCaller.is_online ? "Active / Online" : "Idle / Offline"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between font-mono text-[11px]">
                        <span className="text-[#8A8680]">Today&apos;s Dials:</span>
                        <span className="font-bold text-[#111110] dark:text-[#F5F3EF]">{impersonatedCaller.dials_today} dials</span>
                      </div>
                      <div className="flex items-center justify-between font-mono text-[11px]">
                        <span className="text-[#8A8680]">Ready to Dial:</span>
                        <span className="font-bold text-[#F95721]">{leads.length} leads</span>
                      </div>
                    </div>

                    {/* Dual Attribution Audit Trail */}
                    <p className="text-[11px] text-[#6E6B66] dark:text-[#8A8680] leading-relaxed">
                      Actions logged here will record as{" "}
                      <strong className="text-[#111110] dark:text-[#F5F3EF]">
                        {adminFullName} ({userRole === "admin" ? "Admin" : "Manager"})
                      </strong>{" "}
                      acting on behalf of{" "}
                      <strong className="text-[#111110] dark:text-[#F5F3EF]">{impersonatedCaller.full_name}</strong>.
                    </p>

                    {adminActionsCount > 0 && (
                      <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 font-mono text-[10px]">
                        Session Actions: {adminActionsCount} performed
                      </div>
                    )}
                  </div>

                  <div className="pt-2.5 border-t border-[#ECE8E1] dark:border-[#2D2924] flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setIsMirrorDetailsOpen(false)}
                      className="text-xs text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF]"
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      onClick={handleExitMirrorMode}
                      className="px-3.5 py-1.5 bg-black dark:bg-white text-white dark:text-black rounded-xl text-xs font-bold shadow-sm hover:opacity-90 active:scale-95 transition-all"
                    >
                      Exit Mirror Mode
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Online/Offline indicator */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] shadow-sm text-xs">
            {isOnline ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-feedback-success" />
                <span className="text-[#6E6B66] dark:text-[#8A8680] font-medium hidden sm:inline">Online</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-[#F95721]" />
                <span className="text-[#F95721] font-semibold">Offline</span>
              </>
            )}
          </div>
        </div>
      </div>

      {activeView === "kanban" ? (
        <QueueKanban
          userRole={userRole}
          onSelectLeadForDial={handleSelectFromKanban}
        />
      ) : (
        <>
          {/* Main Single-Column Cockpit (< 768px) and Grid (lg+) */}
          {!currentLead ? (
            totalPoolCount === 0 ? (
          <div className="p-8 sm:p-12 text-center bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] rounded-3xl max-w-lg mx-auto shadow-sm">
            <div className="w-12 h-12 rounded-full bg-[#F95721]/10 text-[#F95721] flex items-center justify-center mx-auto mb-3">
              <Phone className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-bold text-[#111110] dark:text-[#F5F3EF]">No leads in pool</h2>
            <p className="text-xs text-[#6E6B66] dark:text-[#8A8680] mt-1 max-w-sm mx-auto">
              No leads currently exist in the database. Upload a lead CSV in Lead Ingestion to populate your agency outreach pool.
            </p>
            <Link
              href="/manager/ingestion"
              className="inline-flex items-center gap-2 mt-6 px-5 py-2.5 bg-[#F95721] hover:bg-[#E04612] text-white rounded-full font-semibold text-xs transition-transform active:scale-95 shadow-sm"
            >
              <span>Upload Lead CSV</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        ) : (isManagement || impersonatedCaller) && queueScope !== "all" && leads.length === 0 ? (
          <div className="p-8 sm:p-12 text-center bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] rounded-3xl max-w-lg mx-auto shadow-sm">
            <Layers className="w-12 h-12 text-[#6E6B66] dark:text-[#8A8680] mx-auto mb-3" />
            <h2 className="text-lg font-bold text-[#111110] dark:text-[#F5F3EF]">
              No leads in {activeScopeLabel}
            </h2>
            <p className="text-xs text-[#6E6B66] dark:text-[#8A8680] mt-1 max-w-sm mx-auto">
              {impersonatedCaller
                ? `This caller currently has no active leads or all assigned leads are in active cooldown.`
                : `There are ${totalPoolCount} active leads in the master agency deck waiting to be dialed.`}
            </p>
            {impersonatedCaller ? (
              <button
                onClick={handleExitMirrorMode}
                className="mt-6 px-5 py-2.5 bg-black text-white hover:bg-neutral-800 rounded-full font-semibold text-xs transition-transform active:scale-95 shadow-sm"
              >
                Exit Mirror Mode
              </button>
            ) : (
              <button
                onClick={() => handleScopeChange("all")}
                className="mt-6 px-5 py-2.5 bg-[#F95721] hover:bg-[#E04612] text-white rounded-full font-semibold text-xs transition-transform active:scale-95 shadow-sm"
              >
                Switch to All Active Leads ({totalPoolCount})
              </button>
            )}
          </div>
        ) : !isManagement && leads.length === 0 ? (
          <div className="p-8 sm:p-12 text-center bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] rounded-3xl max-w-lg mx-auto shadow-sm">
            <div className="w-12 h-12 rounded-full bg-[#F95721]/10 text-[#F95721] flex items-center justify-center mx-auto mb-3">
              <CheckCircle className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-bold text-[#111110] dark:text-[#F5F3EF]">Queue Complete</h2>
            <p className="text-xs text-[#6E6B66] dark:text-[#8A8680] mt-1 max-w-sm mx-auto">
              Your queue is up to date. Newly assigned leads and callbacks will appear here automatically.
            </p>
            <button
              onClick={() => loadLeads()}
              className="mt-6 px-5 py-2.5 bg-black/5 dark:bg-white/5 hover:bg-black/10 text-[#111110] dark:text-[#F5F3EF] rounded-full font-semibold text-xs transition-transform active:scale-95 shadow-sm inline-flex items-center gap-2"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Check for Updates</span>
            </button>
          </div>
        ) : (
          <div className="p-8 sm:p-12 text-center bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] rounded-3xl max-w-lg mx-auto shadow-sm">
            <CheckCircle className="w-12 h-12 text-feedback-success mx-auto mb-3" />
            <h2 className="text-lg font-bold text-[#111110] dark:text-[#F5F3EF]">Queue Complete</h2>
            <p className="text-xs text-[#6E6B66] dark:text-[#8A8680] mt-1 max-w-sm mx-auto">
              All assigned leads for this session have been dialed. Leads on cadence cooldown will surface automatically once ready.
            </p>
            <button
              onClick={() => loadLeads()}
              className="mt-6 px-5 py-2.5 bg-[#F95721] text-white rounded-full font-semibold text-xs transition-transform active:scale-95 shadow-sm"
            >
              Refresh Queue
            </button>
          </div>
        )
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Active Lead Hero Card (2 cols on lg, full width single col on mobile < 768px) */}
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

                      {/* Quick Reassign Dropdown: strictly available only in Mirror Mode for Managers */}
                      {impersonatedCaller && isManagement && (
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
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[11px] font-bold">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Unassigned Pool</span>
                      </span>

                      {impersonatedCaller && isManagement && (
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
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Lead Information (Large Legible Typography) */}
              <div className="space-y-5 pt-5">
                <div>
                  <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black text-[#111110] dark:text-[#F5F3EF] tracking-tight break-words">
                    {formatLeadName(currentLead.name)}
                  </h2>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-[#F95721]/10 text-[#F95721] border border-[#F95721]/20">
                      {currentLead.niche}
                    </span>
                    <span className="px-3 py-1 rounded-full text-xs font-semibold bg-black/5 dark:bg-white/10 text-[#111110] dark:text-[#F5F3EF] border border-[#ECE8E1] dark:border-[#2D2924]">
                      {currentLead.area}
                    </span>

                    {/* Attempt counter with ceiling (e.g. Attempt 2/5) */}
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-mono font-bold border flex items-center gap-1.5 ${
                        (currentLead.attempts_count || 0) >= 4
                          ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30"
                          : "bg-black/5 dark:bg-white/5 text-[#111110] dark:text-[#F5F3EF] border-[#ECE8E1] dark:border-[#2D2924]"
                      }`}
                    >
                      <Clock className="w-3.5 h-3.5 text-[#F95721]" />
                      <span>
                        {(currentLead.attempts_count || 0) === 0
                          ? "Attempt 1/5"
                          : `Attempt ${Math.min(5, currentLead.attempts_count)}/5`}
                      </span>
                    </span>

                    {/* Decision Maker Name */}
                    <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#F95721]/10 text-[#F95721] border border-[#F95721]/20 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5" />
                      <span>Ask for: <strong>{resolveDecisionMaker(currentLead)}</strong></span>
                    </span>
                  </div>
                </div>

                {/* Previous Call Notes & Cadence Intelligence Card */}
                {loadingNote ? (
                  <div className="p-3 rounded-2xl bg-black/5 dark:bg-white/5 border border-[#ECE8E1] dark:border-[#2D2924] flex items-center gap-2 text-xs text-[#6E6B66] dark:text-[#8A8680]">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#F95721]" />
                    <span>Loading past call history...</span>
                  </div>
                ) : latestCallNote?.notes ? (
                  <div className="p-3.5 sm:p-4 rounded-2xl bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/30 text-xs space-y-1.5 shadow-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 font-bold text-amber-700 dark:text-amber-300 font-mono text-[11px] uppercase tracking-wider">
                        <FileText className="w-3.5 h-3.5" />
                        <span>Previous Call Note ({latestCallNote.outcome.replace("_", " ")})</span>
                      </div>
                      <span className="text-[10px] text-amber-800/80 dark:text-amber-200/80 font-mono">
                        {latestCallNote.caller_name} • {formatRelativeTime(latestCallNote.called_at)}
                      </span>
                    </div>
                    <p className="text-[#111110] dark:text-[#F5F3EF] font-medium leading-relaxed italic bg-white/70 dark:bg-black/30 p-2.5 rounded-xl border border-amber-500/20">
                      &ldquo;{latestCallNote.notes}&rdquo;
                    </p>
                  </div>
                ) : latestCallNote ? (
                  <div className="p-3 rounded-2xl bg-black/5 dark:bg-white/5 border border-[#ECE8E1] dark:border-[#2D2924] flex items-center justify-between text-xs text-[#6E6B66] dark:text-[#8A8680]">
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-[#F95721]" />
                      <span>Last contact: <strong className="capitalize text-[#111110] dark:text-[#F5F3EF]">{latestCallNote.outcome.replace("_", " ")}</strong></span>
                    </div>
                    <span className="text-[10px] font-mono">{latestCallNote.caller_name} • {formatRelativeTime(latestCallNote.called_at)}</span>
                  </div>
                ) : (
                  <div className="p-3 rounded-2xl bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                    <Sparkles className="w-3.5 h-3.5 shrink-0" />
                    <span>Fresh Lead — No previous call attempts or notes logged yet.</span>
                  </div>
                )}

                {/* Primary High-Contrast Phone Number Block (Single dial action enforced) */}
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
                    title="Copy phone number"
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

                {/* Website & Address / Maps Intelligence */}
                {(() => {
                  const isMapsUrl =
                    currentLead.website?.includes("google.com/maps") ||
                    currentLead.website?.includes("maps.app.goo.gl") ||
                    currentLead.website?.includes("goo.gl/maps");

                  const mapsUrl = isMapsUrl
                    ? currentLead.website!
                    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                        `${currentLead.name} ${currentLead.address || currentLead.area || ""}`
                      )}`;

                  const realWebsite =
                    currentLead.website && !isMapsUrl ? currentLead.website : null;

                  const websiteDisplay = realWebsite
                    ? realWebsite.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0]
                    : null;

                  return (
                    <div className="space-y-2.5 text-xs">
                      {/* Official Website Status (Crucial for Website Sales Pitch) */}
                      {realWebsite ? (
                        <div className="p-3 rounded-2xl bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <Globe className="w-4 h-4 text-emerald-500 shrink-0" />
                            <span className="font-bold text-[#111110] dark:text-[#F5F3EF]">Website:</span>
                            <span className="truncate text-emerald-700 dark:text-emerald-300 font-mono font-medium">
                              {websiteDisplay}
                            </span>
                          </div>
                          <a
                            href={realWebsite.startsWith("http") ? realWebsite : `https://${realWebsite}`}
                            target="_blank"
                            rel="noreferrer"
                            className="shrink-0 px-3 py-1 rounded-xl bg-emerald-500 text-white font-bold text-[11px] inline-flex items-center gap-1 transition-transform active:scale-95 shadow-sm"
                          >
                            <span>Open Website</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      ) : (
                        <div className="p-3 rounded-2xl bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Globe className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                            <span className="font-bold text-[#111110] dark:text-[#F5F3EF]">Website:</span>
                            <span className="text-[#6E6B66] dark:text-[#8A8680]">No official website listed</span>
                          </div>
                          <span className="px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 font-mono font-bold text-[10px] tracking-wide uppercase">
                            Pitch Needed
                          </span>
                        </div>
                      )}

                      {/* Full Address Block with Open in Maps button */}
                      {(currentLead.address || currentLead.area) && (
                        <div className="p-3.5 rounded-2xl bg-black/5 dark:bg-white/5 border border-[#ECE8E1] dark:border-[#2D2924] flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2.5 flex-1 min-w-0">
                            <MapPin className="w-4 h-4 text-[#F95721] shrink-0 mt-0.5" />
                            <div className="min-w-0 flex-1">
                              <span className="text-[10px] font-mono uppercase tracking-wider text-[#6E6B66] dark:text-[#8A8680] block mb-0.5">
                                Address & Location
                              </span>
                              <p className="text-xs text-[#111110] dark:text-[#F5F3EF] font-medium leading-relaxed break-words">
                                {currentLead.address || currentLead.area}
                              </p>
                            </div>
                          </div>

                          <a
                            href={mapsUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="shrink-0 px-3 py-1.5 rounded-xl bg-black/5 dark:bg-white/10 hover:bg-[#F95721]/10 hover:text-[#F95721] text-[#111110] dark:text-[#F5F3EF] border border-[#ECE8E1] dark:border-[#2D2924] font-semibold text-xs inline-flex items-center gap-1.5 transition-colors active:scale-95"
                            title="Open in Google Maps"
                          >
                            <span>Open in Maps</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Live Call Duration Banner (Sprint 7 Call Tracking) */}
                {callActive && (
                  <div className="w-full p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-between text-xs font-mono shadow-sm">
                    <div className="flex items-center gap-2 text-red-600 dark:text-red-400 font-bold">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping shrink-0" />
                      <span className="uppercase tracking-wider">Live Call In Progress</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm font-black text-red-600 dark:text-red-400">
                      <span>⏱️</span>
                      <span>{formatDurationTimer(callElapsedSeconds)}</span>
                    </div>
                  </div>
                )}

                {/* Primary Dial CTA (Desktop & Tablet) or Diagnostic Observer Card in Mirror Mode */}
                {impersonatedCaller ? (
                  <div className="pt-2">
                    <div className="p-4 sm:p-5 rounded-3xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3.5 text-amber-900 dark:text-amber-200">
                      <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 text-xl font-bold">
                        👁️
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-bold uppercase tracking-wider font-mono text-amber-700 dark:text-amber-300">
                          Diagnostic Observer Mode
                        </p>
                        <p className="text-xs leading-relaxed text-[#111110]/80 dark:text-[#F5F3EF]/80 max-w-2xl">
                          Direct dialing and outcome logging are disabled in Mirror Mode to prevent interference with {impersonatedCaller.full_name}&apos;s live call session. You can reassign this lead above or leave guidance in the Coaching Notes below.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
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
                )}
              </div>
            </div>

            {/* Embedded Comments Thread / Coaching Notes */}
            <div className="bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] rounded-3xl p-6 shadow-sm space-y-4">
              {impersonatedCaller && (
                <div className="flex items-center justify-between pb-3 border-b border-[#ECE8E1] dark:border-[#2D2924]">
                  <div className="flex items-center gap-2">
                    <span className="text-base">📝</span>
                    <span className="text-xs font-bold uppercase tracking-wider font-mono text-[#F95721]">
                      Live Coaching Notes for {impersonatedCaller.full_name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-mono text-[10px] font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                    <span>Live sync</span>
                  </div>
                </div>
              )}
              <EntityComments entityType="lead" entityId={currentLead.id} />
            </div>
          </div>

          {/* Up Next Queue Deck (1 col) */}
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
    </>
  )}


      {/* Slide-Up Bottom Sheet Outcome Drawer with Rejection Reason */}
      {isDrawerOpen && currentLead && (
        <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex flex-col justify-end md:justify-center md:items-center p-0 md:p-4">
          <div className="absolute inset-0" onClick={() => !isSubmitting && setIsDrawerOpen(false)} />

          <div className="relative w-full md:max-w-xl bg-white dark:bg-[#1C1A17] border-t md:border border-[#ECE8E1] dark:border-[#2D2924] rounded-t-3xl md:rounded-3xl max-h-[88vh] flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-200 overflow-hidden">
            {/* Mobile drag handle */}
            <div className="w-12 h-1.5 bg-black/20 dark:bg-white/20 rounded-full mx-auto my-2.5 md:hidden shrink-0" />

            {/* Header */}
            <div className="px-5 py-3.5 border-b border-[#ECE8E1] dark:border-[#2D2924] flex items-center justify-between shrink-0">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-[#F95721] font-bold">
                  Call Disposition
                </span>
                <h3 className="text-base font-bold text-[#111110] dark:text-[#F5F3EF] truncate max-w-[240px]">
                  {formatLeadName(currentLead.name)}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                {callActive && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 font-mono text-xs font-bold shrink-0">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
                    <span>Talk: {formatDurationTimer(callElapsedSeconds)}</span>
                  </div>
                )}
                <button
                  onClick={() => setIsDrawerOpen(false)}
                  className="text-xs text-[#6E6B66] dark:text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF] p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>

            {/* Scrollable Body */}
            <div className="p-5 flex-1 overflow-y-auto space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#111110] dark:text-[#F5F3EF] mb-2">
                  Select Outcome
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {OUTCOMES.map((item) => {
                    const isSelected = selectedOutcome === item.value;
                    return (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => setSelectedOutcome(item.value)}
                        className={`min-h-[48px] px-3.5 py-2.5 rounded-2xl border text-left flex items-center justify-between gap-2 transition-all cursor-pointer ${
                          isSelected
                            ? "bg-[#F95721] text-white border-[#F95721] font-bold shadow-md ring-2 ring-[#F95721]/30"
                            : "bg-black/5 dark:bg-white/5 border-[#ECE8E1] dark:border-[#2D2924] text-[#111110] dark:text-[#F5F3EF] hover:border-[#F95721]/50"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-base shrink-0">{item.icon}</span>
                          <div className="truncate">
                            <p className="text-xs font-bold truncate leading-tight">{item.label}</p>
                            <p
                              className={`text-[10px] truncate ${
                                isSelected ? "text-white/80" : "text-[#6E6B66] dark:text-[#8A8680]"
                              }`}
                            >
                              {item.desc}
                            </p>
                          </div>
                        </div>
                        <kbd
                          className={`px-1.5 py-0.5 rounded-md font-mono text-[10px] shrink-0 ${
                            isSelected
                              ? "bg-white/20 text-white"
                              : "bg-black/10 dark:bg-white/10 text-[#6E6B66] dark:text-[#8A8680]"
                          }`}
                        >
                          {item.key}
                        </kbd>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Conditional Callback Datetime */}
              {selectedOutcome === "callback" && (
                <div className="p-3.5 rounded-2xl bg-blue-500/10 border border-blue-500/20 space-y-1.5">
                  <label className="block text-xs font-bold text-blue-600 dark:text-blue-400">
                    📅 Callback Date & Time
                  </label>
                  <input
                    type="datetime-local"
                    value={callbackDateTime}
                    onChange={(e) => setCallbackDateTime(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white dark:bg-[#1C1A17] border border-blue-500/30 focus:border-blue-500 rounded-xl text-xs text-[#111110] dark:text-[#F5F3EF] outline-none min-h-[44px]"
                  />
                </div>
              )}

              {/* Conditional Rejection Reason (Rejected / Bad Fit) */}
              {selectedOutcome === "not_interested" && (
                <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 space-y-1.5">
                  <label className="block text-xs font-bold text-rose-600 dark:text-rose-400">
                    ❌ Rejection Reason <span className="text-[10px] font-normal opacity-80">(Required for quarantine holding)</span>
                  </label>
                  <input
                    type="text"
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="e.g. In-house team, bad phone, competitor contract, no budget..."
                    className="w-full px-3 py-2.5 bg-white dark:bg-[#1C1A17] border border-rose-500/30 focus:border-rose-500 rounded-xl text-xs text-[#111110] dark:text-[#F5F3EF] outline-none min-h-[44px]"
                    autoFocus
                  />
                </div>
              )}

              {/* Conditional DNC Confirmation */}
              {selectedOutcome === "dnc" && (
                <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <div className="text-xs">
                      <p className="font-bold text-red-600 dark:text-red-400">Confirm Do Not Call (DNC)</p>
                      <p className="text-[11px] text-[#6E6B66] dark:text-[#8A8680] mt-0.5">
                        This will immediately remove this lead and permanently blacklist the phone number hash across all agency campaigns.
                      </p>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={dncConfirmed}
                      onChange={(e) => setDncConfirmed(e.target.checked)}
                      className="w-4 h-4 rounded text-red-600 border-red-300 focus:ring-red-500 cursor-pointer"
                    />
                    <span className="text-xs font-semibold text-red-600 dark:text-red-400 select-none">
                      I confirm this contact requested DNC
                    </span>
                  </label>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-[#111110] dark:text-[#F5F3EF] mb-1">
                  Call Notes & Objections
                </label>
                <textarea
                  ref={notesInputRef}
                  rows={3}
                  value={callNotes}
                  onChange={(e) => setCallNotes(e.target.value)}
                  placeholder="Key objections, decision maker name, notes..."
                  className="w-full p-3 bg-black/5 dark:bg-white/5 border border-[#ECE8E1] dark:border-[#2D2924] focus:border-[#F95721] rounded-2xl text-xs text-[#111110] dark:text-[#F5F3EF] placeholder:text-[#6E6B66] outline-none resize-none"
                />
              </div>
            </div>

            {/* Footer Submit Action */}
            <div className="p-4 sm:p-5 border-t border-[#ECE8E1] dark:border-[#2D2924] bg-white dark:bg-[#1C1A17] shrink-0">
              <button
                onClick={handleSubmitOutcome}
                disabled={isSubmitting}
                className="w-full min-h-[48px] py-3.5 px-4 bg-[#F95721] hover:bg-[#E04612] text-white font-bold text-xs uppercase tracking-wider rounded-2xl shadow-md flex items-center justify-center gap-2 transition-all disabled:opacity-50 active:scale-[0.99]"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Advancing...</span>
                  </>
                ) : (
                  <>
                    <span>Submit & Next Lead</span>
                    <kbd className="px-2 py-0.5 rounded-full bg-white/20 font-mono text-[10px]">
                      Enter
                    </kbd>
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

export function DesktopQueue({ callerId }: { callerId?: string } = {}) {
  if (callerId) {
    return <DesktopMirrorQueue callerId={callerId} />;
  }
  return <DesktopQueueMain />;
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

  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const resolveTab = useCallback((param: string | null): PipelineTab => {
    if (param === "callbacks" || param === "callback") return "callbacks";
    if (param === "waiting") return "waiting";
    if (param === "done" || param === "done_today") return "done";
    return "dial_now";
  }, []);

  const [caller, setCaller] = useState<CallerProfile | null>(null);
  const [activeTab, setActiveTab] = useState<PipelineTab>(resolveTab(tabParam));

  useEffect(() => {
    if (tabParam) {
      setActiveTab(resolveTab(tabParam));
    }
  }, [tabParam, resolveTab]);

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

