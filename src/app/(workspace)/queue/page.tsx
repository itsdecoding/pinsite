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
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { EntityComments } from "@/components/comms/EntityComments";
import { get, set } from "idb-keyval";

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

function CallerQueueContent() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [totalPoolCount, setTotalPoolCount] = useState<number | null>(null);
  const [unassignedPoolCount, setUnassignedPoolCount] = useState<number>(0);
  const [activeLeadIndex, setActiveLeadIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [callActive, setCallActive] = useState(false);
  const [callStartTime, setCallStartTime] = useState<number | null>(null);
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
  const [isClaiming, setIsClaiming] = useState(false);
  const [callersList, setCallersList] = useState<CallerInfo[]>([]);
  const [isReassigning, setIsReassigning] = useState(false);
  const [impersonatedCaller, setImpersonatedCaller] = useState<{ id: string; full_name: string } | null>(null);
  const [copiedPhone, setCopiedPhone] = useState(false);

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

        // 1. Fetch user role
        const { data: profile } = await supabase
          .from("profiles")
          .select("role, full_name")
          .eq("id", user.id)
          .maybeSingle();

        const role = profile?.role || "caller";
        setUserRole(role);

        // 2. Resolve impersonation (Mirror Mode) if admin or manager
        let activeImpersonation: { id: string; full_name: string } | null = null;
        if (impersonateParam && (role === "admin" || role === "manager")) {
          const { data: callerData } = await supabase
            .from("profiles")
            .select("id, full_name, role")
            .eq("id", impersonateParam)
            .maybeSingle();

          if (callerData) {
            activeImpersonation = { id: callerData.id, full_name: callerData.full_name };
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
    router.push("/queue");
  };

  const handleClaimLeads = async () => {
    setIsClaiming(true);
    try {
      const res = await fetch("/api/queue/claim", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to claim leads");
      await loadLeads();
    } catch (err: any) {
      alert(`Claim error: ${err.message}`);
    } finally {
      setIsClaiming(false);
    }
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
    <div className="space-y-6 max-w-full overflow-x-hidden pb-28 md:pb-8">
      {/* Persistent Manager Mirror Mode Banner */}
      {impersonatedCaller && (
        <div className="sticky top-0 z-[100] -mx-4 sm:-mx-6 lg:-mx-8 -mt-6 sm:-mt-8 mb-4 bg-gradient-to-r from-amber-500 to-amber-600 text-black px-4 py-3 shadow-lg flex flex-wrap items-center justify-between gap-3 font-semibold text-xs sm:text-sm">
          <div className="flex items-center gap-2">
            <span className="text-base sm:text-lg">👁️</span>
            <span>
              <strong>MIRROR MODE:</strong> Viewing queue as <span className="underline decoration-black/60 font-black">{impersonatedCaller.full_name}</span>. Any logged dials will be attributed to this caller.
            </span>
          </div>
          <button
            onClick={handleExitMirrorMode}
            className="px-3.5 py-1.5 bg-black text-white hover:bg-neutral-800 rounded-full text-xs font-bold transition-all shadow-sm shrink-0 active:scale-95"
          >
            Exit Mirror Mode
          </button>
        </div>
      )}

      {/* Sleek Compact Header Bar (Zero wasted vertical space) */}
      <div className="flex items-center justify-between gap-3 pt-1 pb-1">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="text-xs font-mono tracking-wider uppercase text-[#F95721] font-bold">
            {impersonatedCaller
              ? `MIRRORING: ${impersonatedCaller.full_name.toUpperCase()}`
              : isManagement
              ? "OUTBOUND DECK"
              : "DIAL QUEUE"}
          </span>
          {isManagement && (
            <span className="px-2 py-0.5 rounded-full bg-[#F95721]/10 text-[#F95721] text-[10px] font-mono font-bold border border-[#F95721]/20">
              {userRole.toUpperCase()}
            </span>
          )}

          {/* Caller's Queue Number moved directly into the header bar */}
          {leads.length > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F95721] text-white text-xs font-mono font-bold shadow-sm">
              <span>Lead {activeLeadIndex + 1} of {leads.length}</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2.5">
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

          {/* Quick claim button for callers or managers */}
          {unassignedPoolCount > 0 && !impersonatedCaller && (
            <button
              onClick={handleClaimLeads}
              disabled={isClaiming}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F95721]/10 hover:bg-[#F95721]/20 text-[#F95721] border border-[#F95721]/30 text-xs font-semibold transition-all active:scale-95 disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${isClaiming ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">{isClaiming ? "Distributing..." : `Top-Up (${unassignedPoolCount})`}</span>
              <span className="sm:hidden">{unassignedPoolCount}</span>
            </button>
          )}
        </div>
      </div>

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
        ) : !isManagement && unassignedPoolCount > 0 ? (
          <div className="p-8 sm:p-12 text-center bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] rounded-3xl max-w-lg mx-auto shadow-sm">
            <div className="w-12 h-12 rounded-full bg-[#F95721]/10 text-[#F95721] flex items-center justify-center mx-auto mb-3">
              <Sparkles className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-bold text-[#111110] dark:text-[#F5F3EF]">Ready to Start Calling?</h2>
            <p className="text-xs text-[#6E6B66] dark:text-[#8A8680] mt-1 max-w-sm mx-auto">
              Your personal queue is currently empty, but there are {unassignedPoolCount} fresh leads waiting in the pool.
            </p>
            <button
              onClick={handleClaimLeads}
              disabled={isClaiming}
              className="mt-6 px-6 py-2.5 bg-[#F95721] hover:bg-[#E04612] text-white rounded-full font-semibold text-xs transition-transform active:scale-95 shadow-sm inline-flex items-center gap-2 disabled:opacity-50"
            >
              {isClaiming ? <Loader2 className="w-4 h-4 animate-spin" /> : <PhoneCall className="w-4 h-4" />}
              <span>Claim Daily Batch (Top 100)</span>
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
                    {currentLead.name}
                  </h2>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-[#F95721]/10 text-[#F95721] border border-[#F95721]/20">
                      {currentLead.niche}
                    </span>
                    <span className="px-3 py-1 rounded-full text-xs font-semibold bg-black/5 dark:bg-white/10 text-[#111110] dark:text-[#F5F3EF] border border-[#ECE8E1] dark:border-[#2D2924]">
                      {currentLead.area}
                    </span>
                    {currentLead.attempts_count > 0 && (
                      <span className="px-2.5 py-1 rounded-full text-[11px] font-mono text-[#6E6B66] dark:text-[#8A8680] bg-black/5 dark:bg-white/5 border border-[#ECE8E1] dark:border-[#2D2924]">
                        {currentLead.attempts_count} {currentLead.attempts_count === 1 ? "attempt" : "attempts"}
                      </span>
                    )}
                  </div>
                </div>

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

                {/* Address & External Links Block (Wraps naturally, zero truncation, clean Maps button) */}
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
                      {/* Full Address Block */}
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

                          {/* Open in Maps Button */}
                          <a
                            href={mapsUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="shrink-0 px-3 py-1.5 rounded-xl bg-[#F95721]/10 hover:bg-[#F95721]/20 text-[#F95721] border border-[#F95721]/20 font-semibold text-xs inline-flex items-center gap-1.5 transition-colors active:scale-95"
                            title="Open in Google Maps"
                          >
                            <span>Open in Maps</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      )}

                      {/* Clean Website Button */}
                      {realWebsite && (
                        <div className="flex items-center gap-2">
                          <a
                            href={realWebsite.startsWith("http") ? realWebsite : `https://${realWebsite}`}
                            target="_blank"
                            rel="noreferrer"
                            className="px-3.5 py-2 rounded-xl bg-black/5 dark:bg-white/5 hover:bg-[#F95721]/10 hover:text-[#F95721] border border-[#ECE8E1] dark:border-[#2D2924] text-xs font-semibold inline-flex items-center gap-2 transition-colors text-[#111110] dark:text-[#F5F3EF]"
                          >
                            <Globe className="w-3.5 h-3.5 text-[#F95721] shrink-0" />
                            <span>Visit Website ({websiteDisplay})</span>
                            <ExternalLink className="w-3 h-3 shrink-0 text-[#6E6B66] dark:text-[#8A8680]" />
                          </a>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Primary Dial CTA (Desktop & Tablet) */}
                <div className="pt-2 flex flex-col sm:flex-row items-center gap-4">
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

            {/* Embedded Comments Thread */}
            <div className="bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] rounded-3xl p-6 shadow-sm">
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
                    <p className="text-xs text-[#111110] dark:text-[#F5F3EF] truncate font-bold">
                      {lead.name}
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

      {/* Floating Bottom-Anchored Dial Bar (Mobile <768px) */}
      {currentLead && (
        <div className="fixed md:hidden bottom-0 left-0 right-0 z-[90] p-3 bg-white/95 dark:bg-[#1C1A17]/95 backdrop-blur-md border-t border-[#ECE8E1] dark:border-[#2D2924] pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-2xl">
          <div className="flex items-center gap-2 max-w-lg mx-auto">
            <a
              href={formatTelLink(currentLead.phone)}
              onClick={handleStartCall}
              className="flex-1 min-h-[48px] py-3.5 px-4 bg-[#F95721] hover:bg-[#E04612] text-white font-bold text-sm uppercase tracking-wider rounded-2xl shadow-lg flex items-center justify-center gap-2 active:scale-[0.98] transition-all text-center"
            >
              <PhoneCall className="w-5 h-5 animate-pulse shrink-0" />
              <span className="truncate">Dial ({formatPhoneDisplay(currentLead.phone)})</span>
            </a>
            <button
              onClick={() => setIsDrawerOpen(true)}
              className="min-h-[48px] py-3.5 px-4 bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/15 text-[#111110] dark:text-[#F5F3EF] font-bold text-xs rounded-2xl border border-[#ECE8E1] dark:border-[#2D2924] flex items-center justify-center gap-1 active:scale-95 transition-all shrink-0"
            >
              <span>Outcome</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
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
                <h3 className="text-base font-bold text-[#111110] dark:text-[#F5F3EF] truncate max-w-[280px]">
                  {currentLead.name}
                </h3>
              </div>
              <button
                onClick={() => setIsDrawerOpen(false)}
                className="text-xs text-[#6E6B66] dark:text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF] p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              >
                Close
              </button>
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
