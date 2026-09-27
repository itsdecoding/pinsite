"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
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
  { key: "1", label: "No Answer", value: "no_answer" },
  { key: "2", label: "Gatekeeper", value: "gatekeeper" },
  { key: "3", label: "DM Reached", value: "dm_reached" },
  { key: "4", label: "Interested", value: "interested" },
  { key: "5", label: "Callback", value: "callback" },
  { key: "6", label: "DNC", value: "dnc" },
  { key: "7", label: "Not Interested", value: "not_interested" },
];

type QueueScope = "all" | "unassigned" | "assigned" | "mine" | string;

export default function CallerQueuePage() {
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [userRole, setUserRole] = useState<string>("caller");
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [queueScope, setQueueScope] = useState<QueueScope>("all");
  const [isClaiming, setIsClaiming] = useState(false);
  const [callersList, setCallersList] = useState<CallerInfo[]>([]);
  const [isReassigning, setIsReassigning] = useState(false);

  const supabase = createClient();
  const notesInputRef = useRef<HTMLTextAreaElement>(null);

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
    async (scopeOverride?: QueueScope) => {
      setLoading(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          const cached = await get("cached_leads");
          if (cached && Array.isArray(cached)) setLeads(cached);
          setLoading(false);
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

        // 2. Check total pool & unassigned counts
        const { count: poolCount } = await supabase
          .from("leads")
          .select("*", { count: "exact", head: true })
          .is("deleted_at", null)
          .not("status", "in", '("closed_won","closed_lost","dnc")');

        setTotalPoolCount(poolCount || 0);

        const { count: unassignedCount } = await supabase
          .from("leads")
          .select("*", { count: "exact", head: true })
          .is("deleted_at", null)
          .is("assigned_to", null)
          .not("status", "in", '("closed_won","closed_lost","dnc")');

        setUnassignedPoolCount(unassignedCount || 0);

        // 3. For Managers/Admins: Fetch active callers list and count their assigned leads
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
            .not("status", "in", '("closed_won","closed_lost","dnc")')
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

        // 4. Build query based on role and scope
        let query = supabase
          .from("leads")
          .select("*, profiles:assigned_to(full_name)")
          .is("deleted_at", null)
          .not("status", "in", '("closed_won","closed_lost","dnc")');

        if (role === "caller") {
          // Callers only see their assigned leads
          query = query.eq("assigned_to", user.id);
        } else {
          // Admins & Managers can filter by All, Unassigned, Assigned, My Queue, or a Specific Caller
          if (activeScope === "mine") {
            query = query.eq("assigned_to", user.id);
          } else if (activeScope === "unassigned") {
            query = query.is("assigned_to", null);
          } else if (activeScope === "assigned") {
            query = query.not("assigned_to", "is", null);
          } else if (activeScope.startsWith("caller_")) {
            const specificCallerId = activeScope.replace("caller_", "");
            query = query.eq("assigned_to", specificCallerId);
          }
          // 'all' doesn't restrict assigned_to
        }

        query = query
          .order("next_callback_at", { ascending: true, nullsFirst: false })
          .order("score", { ascending: false });

        const { data, error } = await query;
        if (error) throw error;

        if (data && data.length > 0) {
          setLeads(data);
          setActiveLeadIndex(0);
          await set("cached_leads", data);
        } else {
          setLeads([]);
        }
      } catch (err: any) {
        console.warn("Fallback to offline cache:", err);
        const cached = await get("cached_leads");
        if (cached && Array.isArray(cached)) setLeads(cached);
      } finally {
        setLoading(false);
      }
    },
    [supabase, queueScope]
  );

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

  const handleScopeChange = (newScope: QueueScope) => {
    setQueueScope(newScope);
    loadLeads(newScope);
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

  const currentLead = leads[activeLeadIndex] || null;

  const handleStartCall = () => {
    if (!currentLead) return;
    setCallActive(true);
    setCallStartTime(Date.now());
    setIsDrawerOpen(true);
    setSelectedOutcome("no_answer");
    setCallNotes("");
    setCallbackDateTime("");
    window.location.href = `tel:${currentLead.normalized_phone || currentLead.phone}`;
  };

  const handleSubmitOutcome = async () => {
    if (!currentLead || isSubmitting) return;

    setIsSubmitting(true);
    const duration = callStartTime ? Math.round((Date.now() - callStartTime) / 1000) : 0;
    const clientOfflineId = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : undefined;

    const payload = {
      p_lead_id: currentLead.id,
      p_status: selectedOutcome,
      p_callback_at: selectedOutcome === "callback" && callbackDateTime ? callbackDateTime : null,
      p_notes: callNotes.trim() || null,
      p_duration_seconds: duration,
      p_client_offline_id: clientOfflineId,
    };

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
        handleStartCall();
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
  }, [isDrawerOpen, currentLead, selectedOutcome, callNotes, callbackDateTime]);

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
  if (queueScope === "unassigned") activeScopeLabel = "Unassigned Pool";
  else if (queueScope === "assigned") activeScopeLabel = "All Assigned Leads";
  else if (queueScope === "mine") activeScopeLabel = "My Assigned Queue";
  else if (queueScope.startsWith("caller_")) {
    const callerId = queueScope.replace("caller_", "");
    const caller = callersList.find((c) => c.id === callerId);
    activeScopeLabel = caller ? `${caller.full_name}'s Queue` : "Caller Queue";
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pt-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono tracking-widest uppercase text-[#F95721] font-semibold">
              {isManagement ? "AGENCY OUTBOUND DECK" : "CALLER WORKSPACE"}
            </span>
            {isManagement && (
              <span className="px-2 py-0.5 rounded-full bg-[#F95721]/10 text-[#F95721] text-[10px] font-mono font-bold border border-[#F95721]/20">
                {userRole.toUpperCase()}
              </span>
            )}
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-[#111110] dark:text-[#F5F3EF] tracking-tight mt-1">
            High-velocity speed dialing.
          </h1>
          <p className="text-xs text-[#6E6B66] dark:text-[#8A8680] mt-1.5">
            Hotkeys: <kbd className="px-1.5 py-0.5 rounded-md bg-black/5 dark:bg-white/10 font-mono text-[10px]">Space</kbd> Dial • <kbd className="px-1.5 py-0.5 rounded-md bg-black/5 dark:bg-white/10 font-mono text-[10px]">1-7</kbd> Outcome • <kbd className="px-1.5 py-0.5 rounded-md bg-black/5 dark:bg-white/10 font-mono text-[10px]">Enter</kbd> Save & Next
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Online/Offline indicator */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] shadow-sm text-xs">
            {isOnline ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-feedback-success" />
                <span className="text-[#6E6B66] dark:text-[#8A8680] font-medium">Online Mode</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-[#F95721]" />
                <span className="text-[#F95721] font-semibold">Offline Cached</span>
              </>
            )}
          </div>

          {/* Quick claim button for callers or managers */}
          {unassignedPoolCount > 0 && (
            <button
              onClick={handleClaimLeads}
              disabled={isClaiming}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#F95721]/10 hover:bg-[#F95721]/20 text-[#F95721] border border-[#F95721]/30 text-xs font-semibold transition-all active:scale-95 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isClaiming ? "animate-spin" : ""}`} />
              <span>{isClaiming ? "Distributing..." : `Top-Up (${unassignedPoolCount} Unassigned)`}</span>
            </button>
          )}
        </div>
      </div>

      {/* Scope Filter Switcher for Managers / Admins: Filter by All, Unassigned, or Specific Callers */}
      {isManagement && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs no-scrollbar">
          <span className="text-[11px] font-mono uppercase text-[#6E6B66] dark:text-[#8A8680] mr-1 shrink-0">
            Deck Scope:
          </span>

          <button
            onClick={() => handleScopeChange("all")}
            className={`px-3.5 py-1.5 rounded-full font-semibold transition-all shrink-0 ${
              queueScope === "all"
                ? "bg-[#111110] dark:bg-[#F5F3EF] text-white dark:text-[#111110] shadow-sm"
                : "bg-white dark:bg-[#1C1A17] text-[#6E6B66] dark:text-[#8A8680] border border-[#ECE8E1] dark:border-[#2D2924] hover:border-[#F95721]/50"
            }`}
          >
            All Active Leads ({totalPoolCount ?? 0})
          </button>

          <button
            onClick={() => handleScopeChange("unassigned")}
            className={`px-3.5 py-1.5 rounded-full font-semibold transition-all shrink-0 ${
              queueScope === "unassigned"
                ? "bg-[#111110] dark:bg-[#F5F3EF] text-white dark:text-[#111110] shadow-sm"
                : "bg-white dark:bg-[#1C1A17] text-[#6E6B66] dark:text-[#8A8680] border border-[#ECE8E1] dark:border-[#2D2924] hover:border-[#F95721]/50"
            }`}
          >
            Unassigned Pool ({unassignedPoolCount})
          </button>

          <span className="w-px h-4 bg-[#ECE8E1] dark:border-[#2D2924] shrink-0" />

          {/* Dynamic Caller Filter Pills */}
          {callersList.map((caller) => {
            const isSelected = queueScope === `caller_${caller.id}`;
            return (
              <button
                key={caller.id}
                onClick={() => handleScopeChange(`caller_${caller.id}`)}
                className={`px-3 py-1.5 rounded-full font-semibold transition-all shrink-0 flex items-center gap-1.5 ${
                  isSelected
                    ? "bg-[#F95721] text-white shadow-sm"
                    : "bg-white dark:bg-[#1C1A17] text-[#6E6B66] dark:text-[#8A8680] border border-[#ECE8E1] dark:border-[#2D2924] hover:border-[#F95721]/50"
                }`}
              >
                <User className="w-3 h-3 shrink-0" />
                <span>{caller.full_name}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                    isSelected
                      ? "bg-white/20 text-white"
                      : "bg-black/5 dark:bg-white/10 text-[#6E6B66] dark:text-[#8A8680]"
                  }`}
                >
                  {caller.lead_count}
                </span>
              </button>
            );
          })}

          <span className="w-px h-4 bg-[#ECE8E1] dark:border-[#2D2924] shrink-0" />

          <button
            onClick={() => handleScopeChange("mine")}
            className={`px-3.5 py-1.5 rounded-full font-semibold transition-all shrink-0 ${
              queueScope === "mine"
                ? "bg-[#111110] dark:bg-[#F5F3EF] text-white dark:text-[#111110] shadow-sm"
                : "bg-white dark:bg-[#1C1A17] text-[#6E6B66] dark:text-[#8A8680] border border-[#ECE8E1] dark:border-[#2D2924] hover:border-[#F95721]/50"
            }`}
          >
            My Queue
          </button>
        </div>
      )}

      {/* Main Workspace */}
      {!currentLead ? (
        totalPoolCount === 0 ? (
          <div className="p-12 text-center bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] rounded-3xl max-w-lg mx-auto shadow-sm">
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
        ) : isManagement && queueScope !== "all" && leads.length === 0 ? (
          <div className="p-12 text-center bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] rounded-3xl max-w-lg mx-auto shadow-sm">
            <Layers className="w-12 h-12 text-[#6E6B66] dark:text-[#8A8680] mx-auto mb-3" />
            <h2 className="text-lg font-bold text-[#111110] dark:text-[#F5F3EF]">
              No leads in {activeScopeLabel}
            </h2>
            <p className="text-xs text-[#6E6B66] dark:text-[#8A8680] mt-1 max-w-sm mx-auto">
              There are {totalPoolCount} active leads in the master agency deck waiting to be dialed.
            </p>
            <button
              onClick={() => handleScopeChange("all")}
              className="mt-6 px-5 py-2.5 bg-[#F95721] hover:bg-[#E04612] text-white rounded-full font-semibold text-xs transition-transform active:scale-95 shadow-sm"
            >
              Switch to All Active Leads ({totalPoolCount})
            </button>
          </div>
        ) : !isManagement && unassignedPoolCount > 0 ? (
          <div className="p-12 text-center bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] rounded-3xl max-w-lg mx-auto shadow-sm">
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
          <div className="p-12 text-center bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] rounded-3xl max-w-lg mx-auto shadow-sm">
            <CheckCircle className="w-12 h-12 text-feedback-success mx-auto mb-3" />
            <h2 className="text-lg font-bold text-[#111110] dark:text-[#F5F3EF]">Queue Complete</h2>
            <p className="text-xs text-[#6E6B66] dark:text-[#8A8680] mt-1 max-w-sm mx-auto">
              All assigned leads for this session have been dialed. Next daily 100-lead top-up executes at 06:00 AM IST.
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
          {/* Active Lead Hero Card (2 cols) */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] rounded-3xl p-6 sm:p-8 shadow-sm relative overflow-hidden">
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
                            ? "You (Admin)"
                            : currentLead.profiles?.full_name || "Caller"}
                        </strong>
                      </span>

                      {/* Quick Reassign Dropdown for Management */}
                      {isManagement && (
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

                      {isManagement && (
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

                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F95721]/10 text-[#F95721] border border-[#F95721]/20 font-mono text-xs font-bold">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Score {currentLead.score}</span>
                </div>
              </div>

              <div className="space-y-6 pt-6">
                <div>
                  <h2 className="text-2xl sm:text-3xl font-black text-[#111110] dark:text-[#F5F3EF] tracking-tight">
                    {currentLead.name}
                  </h2>
                  <p className="text-xs text-[#6E6B66] dark:text-[#8A8680] mt-1">
                    {currentLead.niche} • {currentLead.area}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  {/* Address / Google Maps Card */}
                  <div className="flex items-center gap-2 p-3 rounded-2xl bg-black/5 dark:bg-white/5 border border-[#ECE8E1] dark:border-[#2D2924]">
                    <MapPin className="w-4 h-4 text-[#F95721] shrink-0" />
                    {currentLead.address ? (
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                          `${currentLead.name} ${currentLead.address}`
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#111110] dark:text-[#F5F3EF] truncate hover:text-[#F95721] hover:underline"
                        title={currentLead.address}
                      >
                        {currentLead.address}
                      </a>
                    ) : (
                      <span className="text-[#6E6B66] dark:text-[#8A8680]">{currentLead.area}</span>
                    )}
                  </div>

                  {/* Website Card */}
                  <div className="flex items-center gap-2 p-3 rounded-2xl bg-black/5 dark:bg-white/5 border border-[#ECE8E1] dark:border-[#2D2924]">
                    <Globe className="w-4 h-4 text-[#F95721] shrink-0" />
                    {currentLead.website ? (
                      <a
                        href={
                          currentLead.website.startsWith("http")
                            ? currentLead.website
                            : `https://${currentLead.website}`
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="truncate text-[#F95721] font-semibold hover:underline flex items-center gap-1"
                      >
                        <span className="truncate">{currentLead.website}</span>
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                    ) : (
                      <span className="text-[#6E6B66] dark:text-[#8A8680]">No website</span>
                    )}
                  </div>
                </div>

                {/* Primary Dial CTA */}
                <div className="pt-2 flex flex-col sm:flex-row items-center gap-4">
                  <button
                    onClick={handleStartCall}
                    className="w-full sm:w-auto flex-1 py-4 px-8 bg-[#F95721] hover:bg-[#E04612] text-white font-bold text-sm uppercase tracking-wider rounded-full shadow-lg flex items-center justify-center gap-3 transition-transform active:scale-[0.98]"
                  >
                    <PhoneCall className="w-5 h-5 animate-pulse" />
                    <span>Dial Now ({currentLead.normalized_phone || currentLead.phone})</span>
                  </button>

                  <button
                    onClick={() => setIsDrawerOpen(true)}
                    className="w-full sm:w-auto py-4 px-6 bg-white dark:bg-[#1C1A17] hover:bg-black/5 dark:hover:bg-white/5 border border-[#ECE8E1] dark:border-[#2D2924] rounded-full text-xs font-semibold text-[#111110] dark:text-[#F5F3EF] transition-colors flex items-center justify-center gap-2"
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
          <div className="bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] rounded-3xl p-6 shadow-sm flex flex-col h-[640px]">
            <div className="flex items-center justify-between pb-4 border-b border-[#ECE8E1] dark:border-[#2D2924]">
              <span className="text-xs font-bold uppercase tracking-wider text-[#111110] dark:text-[#F5F3EF] font-mono">
                Deck Queue
              </span>
              <span className="text-xs font-mono font-semibold text-[#F95721]">
                {leads.length} leads
              </span>
            </div>

            {/* Leads List with explicit Caller Ownership Badges */}
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

                  <span className="text-xs font-mono font-bold text-[#F95721] shrink-0">
                    {lead.score}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 3-Second Post-Call Drawer */}
      {isDrawerOpen && currentLead && (
        <div className="fixed inset-0 z-[200] bg-black/40 backdrop-blur-sm flex justify-end">
          <div className="w-full max-w-md bg-white dark:bg-[#1C1A17] border-l border-[#ECE8E1] dark:border-[#2D2924] h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="p-6 border-b border-[#ECE8E1] dark:border-[#2D2924] flex items-center justify-between">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-[#F95721] font-bold">
                  Post-Call Disposition
                </span>
                <h3 className="text-base font-bold text-[#111110] dark:text-[#F5F3EF] truncate max-w-[280px]">
                  {currentLead.name}
                </h3>
              </div>
              <button
                onClick={() => setIsDrawerOpen(false)}
                className="text-xs text-[#6E6B66] dark:text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF] px-2 py-1"
              >
                Close
              </button>
            </div>

            {/* Outcome Selection Buttons */}
            <div className="p-6 flex-1 overflow-y-auto space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#111110] dark:text-[#F5F3EF] mb-2">
                  Select Outcome (Press 1 - 7)
                </label>
                <div className="grid grid-cols-1 gap-2">
                  {OUTCOMES.map((item) => (
                    <button
                      key={item.value}
                      onClick={() => setSelectedOutcome(item.value)}
                      className={`px-4 py-3 rounded-2xl border text-left flex items-center justify-between transition-all ${
                        selectedOutcome === item.value
                          ? "bg-[#F95721] text-white border-[#F95721] font-bold shadow-md"
                          : "bg-black/5 dark:bg-white/5 border-[#ECE8E1] dark:border-[#2D2924] text-[#111110] dark:text-[#F5F3EF] hover:border-[#F95721]/50"
                      }`}
                    >
                      <span className="text-xs">{item.label}</span>
                      <kbd className="px-2 py-0.5 rounded-lg bg-black/10 dark:bg-white/10 font-mono text-[10px]">
                        {item.key}
                      </kbd>
                    </button>
                  ))}
                </div>
              </div>

              {selectedOutcome === "callback" && (
                <div>
                  <label className="block text-xs font-semibold text-[#F95721] mb-1">
                    Callback Date & Time
                  </label>
                  <input
                    type="datetime-local"
                    value={callbackDateTime}
                    onChange={(e) => setCallbackDateTime(e.target.value)}
                    className="w-full px-3 py-2 bg-black/5 dark:bg-white/5 border border-[#ECE8E1] dark:border-[#2D2924] rounded-xl text-xs text-[#111110] dark:text-[#F5F3EF] outline-none"
                  />
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

            {/* Submit Action */}
            <div className="p-6 border-t border-[#ECE8E1] dark:border-[#2D2924]">
              <button
                onClick={handleSubmitOutcome}
                disabled={isSubmitting}
                className="w-full py-3.5 px-4 bg-[#F95721] hover:bg-[#E04612] text-white font-bold text-xs uppercase tracking-wider rounded-full shadow-md flex items-center justify-center gap-2 transition-all disabled:opacity-50"
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
