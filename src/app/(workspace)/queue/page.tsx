"use client";

import React, { useEffect, useState, useCallback, useRef, Suspense } from "react";
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
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { EntityComments } from "@/components/comms/EntityComments";
import { get, set } from "idb-keyval";
import { CallerCockpit } from "@/components/queue/CallerCockpit";
import { AdminQueue } from "@/components/queue/AdminQueue";

interface Lead {
  id: string;
  name: string;
  phone: string;
  normalized_phone: string;
  website: string | null;
  has_website: boolean;
  address: string | null;
  niche: string;
  area: string;
  score: number;
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

function CallerQueueContent() {
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
  const [viewMode, setViewMode] = useState<"auto" | "cockpit" | "admin">("auto");
  const dialerOpenedRef = useRef(false);

  // Auto-open disposition drawer when caller returns from native phone dialer
  useEffect(() => {
    function handleVisibilityOrFocus() {
      if (document.visibilityState === "visible" && dialerOpenedRef.current) {
        dialerOpenedRef.current = false;
        setIsDrawerOpen(true);
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityOrFocus);
    window.addEventListener("focus", handleVisibilityOrFocus);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
      window.removeEventListener("focus", handleVisibilityOrFocus);
    };
  }, []);
  const [latestCallNote, setLatestCallNote] = useState<CallLogSummary | null>(null);
  const [loadingNote, setLoadingNote] = useState(false);

  const searchParams = useSearchParams();
  const router = useRouter();
  const impersonateParam = searchParams.get("impersonate");

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

        // 3. Check total pool & unassigned counts (strictly excluding not_interested)
        const { count: poolCount } = await supabase
          .from("leads")
          .select("*", { count: "exact", head: true })
          .is("deleted_at", null)
          .not("status", "in", '("closed_won","closed_lost","dnc","not_interested")');

        setTotalPoolCount(poolCount || 0);

        const { count: unassignedCount } = await supabase
          .from("leads")
          .select("*", { count: "exact", head: true })
          .is("deleted_at", null)
          .is("assigned_to", null)
          .not("status", "in", '("closed_won","closed_lost","dnc","not_interested")');

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
            .not("status", "in", '("closed_won","closed_lost","dnc","not_interested")')
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
        // Strictly exclude not_interested & exclude active cooldowns (cooldown_until > NOW())
        const buildLeadQuery = (includeCooldown: boolean) => {
          let q = supabase
            .from("leads")
            .select("*, profiles:assigned_to(full_name)")
            .is("deleted_at", null)
            .not("status", "in", '("closed_won","closed_lost","dnc","not_interested")');

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
    router.push("/manager/team");
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
    dialerOpenedRef.current = true;
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
  const showCallerCockpit = userRole === "caller" || Boolean(impersonatedCaller) || viewMode === "cockpit";

  return (
    <div className="space-y-6 max-w-full overflow-x-hidden pb-24 md:pb-8">
      {showCallerCockpit ? (
        <div className="space-y-3">
          {isManagement && !impersonatedCaller && (
            <div className="flex items-center justify-between pb-2 border-b border-[#ECE8E1] dark:border-[#2D2924] px-1">
              <span className="text-xs font-mono text-[#F95721] font-bold">
                📱 PREVIEWING CALLER COCKPIT
              </span>
              <button
                type="button"
                onClick={() => setViewMode("admin")}
                className="px-3 py-1 rounded-full bg-black/5 dark:bg-white/5 hover:bg-black/10 border border-[#ECE8E1] dark:border-[#2D2924] text-xs font-mono font-semibold text-[#111110] dark:text-[#F5F3EF]"
              >
                &larr; Return to Admin Deck
              </button>
            </div>
          )}
          <CallerCockpit
            leads={leads}
            activeLeadIndex={activeLeadIndex}
            setActiveLeadIndex={setActiveLeadIndex}
            currentLead={currentLead}
            callActive={callActive}
            callElapsedSeconds={callElapsedSeconds}
            handleStartCall={handleStartCall}
            setIsDrawerOpen={setIsDrawerOpen}
            latestCallNote={latestCallNote}
            loadingNote={loadingNote}
            impersonatedCaller={impersonatedCaller}
            copiedPhone={copiedPhone}
            setCopiedPhone={setCopiedPhone}
            loadLeads={loadLeads}
          />
        </div>
      ) : (
        <AdminQueue
          leads={leads}
          activeLeadIndex={activeLeadIndex}
          setActiveLeadIndex={setActiveLeadIndex}
          currentLead={currentLead}
          callActive={callActive}
          callElapsedSeconds={callElapsedSeconds}
          handleStartCall={handleStartCall}
          setIsDrawerOpen={setIsDrawerOpen}
          latestCallNote={latestCallNote}
          loadingNote={loadingNote}
          impersonatedCaller={impersonatedCaller}
          userRole={userRole}
          currentUserId={currentUserId}
          callersList={callersList}
          handleReassignLead={handleReassignLead}
          isReassigning={isReassigning}
          queueScope={queueScope}
          handleScopeChange={handleScopeChange}
          totalPoolCount={totalPoolCount || 0}
          unassignedPoolCount={unassignedPoolCount}
          copiedPhone={copiedPhone}
          setCopiedPhone={setCopiedPhone}
          loadLeads={loadLeads}
          onSwitchToCockpit={() => setViewMode("cockpit")}
        />
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

export default function CallerQueuePage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-[#6E6B66] dark:text-[#8A8680]">
          <Loader2 className="w-8 h-8 animate-spin text-[#F95721]" />
          <p className="text-xs font-mono uppercase tracking-wider">Syncing Outbound Deck...</p>
        </div>
      }
    >
      <CallerQueueContent />
    </Suspense>
  );
}
