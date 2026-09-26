"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
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
  attempts_count: number;
  next_callback_at: string | null;
  last_called_at: string | null;
}

const OUTCOMES = [
  { key: "1", label: "No Answer", value: "no_answer", color: "text-text-muted" },
  { key: "2", label: "Gatekeeper", value: "gatekeeper", color: "text-feedback-warning" },
  { key: "3", label: "DM Reached", value: "dm_reached", color: "text-feedback-info" },
  { key: "4", label: "Interested", value: "interested", color: "text-feedback-success" },
  { key: "5", label: "Callback", value: "callback", color: "text-accent-primary" },
  { key: "6", label: "DNC", value: "dnc", color: "text-feedback-error" },
  { key: "7", label: "Not Interested", value: "not_interested", color: "text-text-secondary" },
];

export default function CallerQueuePage() {
  const [leads, setLeads] = useState<Lead[]>([]);
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
  const [activeTab, setActiveTab] = useState<"outcome" | "comments">("outcome");

  const supabase = createClient();
  const notesInputRef = useRef<HTMLTextAreaElement>(null);

  // Load leads with offline-first support via idb-keyval
  const loadLeads = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        // Try loading from offline cache
        const cached = await get("cached_leads");
        if (cached && Array.isArray(cached)) {
          setLeads(cached);
        }
        setLoading(false);
        return;
      }

      // Strict queue ordering: Urgent Callbacks -> Today's Callbacks -> Score DESC
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .eq("assigned_to", user.id)
        .is("deleted_at", null)
        .not("status", "in", '("closed_won","closed_lost","dnc")')
        .order("next_callback_at", { ascending: true, nullsFirst: false })
        .order("score", { ascending: false });

      if (error) throw error;

      if (data) {
        setLeads(data);
        await set("cached_leads", data);
      }
    } catch (err: any) {
      console.warn("Failed to fetch fresh leads, falling back to cache:", err);
      const cached = await get("cached_leads");
      if (cached && Array.isArray(cached)) {
        setLeads(cached);
      }
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadLeads();

    function handleOnline() {
      setIsOnline(true);
      syncOfflineCalls();
    }
    function handleOffline() {
      setIsOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    setIsOnline(navigator.onLine);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [loadLeads]);

  // Sync queued offline calls when back online
  async function syncOfflineCalls() {
    const offlineCalls = (await get("offline_call_queue")) || [];
    if (!Array.isArray(offlineCalls) || offlineCalls.length === 0) return;

    for (const call of offlineCalls) {
      try {
        await supabase.rpc("caller_update_lead", {
          p_lead_id: call.lead_id,
          p_status: call.status,
          p_callback_at: call.callback_at || null,
          p_notes: call.notes || null,
          p_duration_seconds: call.duration_seconds || 0,
        });
      } catch (e) {
        console.error("Failed to sync offline call:", e);
      }
    }
    await set("offline_call_queue", []);
  }

  const currentLead = leads[activeLeadIndex] || null;

  // Trigger mobile speed dial
  const handleStartCall = () => {
    if (!currentLead) return;
    setCallActive(true);
    setCallStartTime(Date.now());
    setIsDrawerOpen(true);
    setSelectedOutcome("no_answer");
    setCallNotes("");
    setCallbackDateTime("");

    // Trigger native tel: link
    window.location.href = `tel:${currentLead.normalized_phone || currentLead.phone}`;
  };

  // Submit outcome via RPC procedure caller_update_lead
  const handleSubmitOutcome = async () => {
    if (!currentLead || isSubmitting) return;

    setIsSubmitting(true);
    const duration = callStartTime ? Math.round((Date.now() - callStartTime) / 1000) : 0;

    const payload = {
      p_lead_id: currentLead.id,
      p_status: selectedOutcome,
      p_callback_at: selectedOutcome === "callback" && callbackDateTime ? callbackDateTime : null,
      p_notes: callNotes.trim() || null,
      p_duration_seconds: duration,
    };

    try {
      if (isOnline) {
        const { error } = await supabase.rpc("caller_update_lead", payload);
        if (error) throw error;
      } else {
        // Queue offline
        const queue = (await get("offline_call_queue")) || [];
        queue.push({
          lead_id: currentLead.id,
          status: selectedOutcome,
          callback_at: payload.p_callback_at,
          notes: payload.p_notes,
          duration_seconds: duration,
          timestamp: new Date().toISOString(),
        });
        await set("offline_call_queue", queue);
      }

      // Fast transition: auto-close drawer and focus next lead in < 150ms
      setTimeout(() => {
        setIsDrawerOpen(false);
        setCallActive(false);
        setCallStartTime(null);
        setIsSubmitting(false);

        // Remove from local list or advance index
        setLeads((prev) => prev.filter((_, idx) => idx !== activeLeadIndex));
      }, 100);
    } catch (err: any) {
      alert(`Error recording call: ${err.message}`);
      setIsSubmitting(false);
    }
  };

  // Desktop keyboard shortcuts: Space to dial, 1-7 for outcome, Enter to submit
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't intercept if user is typing in textarea or input
      const target = e.target as HTMLElement;
      if (target.tagName === "TEXTAREA" || target.tagName === "INPUT") {
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
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-text-secondary">
        <Loader2 className="w-8 h-8 animate-spin text-accent-primary" />
        <p className="text-xs font-mono uppercase tracking-wider">Syncing Outbound Queue...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Banner & Status */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-border-subtle">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-text-primary">
              Outbound Outreach Engine
            </h1>
            <span className="px-2 py-0.5 rounded-full text-xs font-mono font-semibold bg-accent-subtle text-accent-primary border border-accent-border">
              {leads.length} Leads
            </span>
          </div>
          <p className="text-xs text-text-secondary mt-1">
            Shortcuts: <kbd className="px-1.5 py-0.5 rounded bg-background-elevated border border-border-subtle text-text-primary font-mono text-[10px]">Space</kbd> Dial • <kbd className="px-1.5 py-0.5 rounded bg-background-elevated border border-border-subtle text-text-primary font-mono text-[10px]">1-7</kbd> Outcome • <kbd className="px-1.5 py-0.5 rounded bg-background-elevated border border-border-subtle text-text-primary font-mono text-[10px]">Enter</kbd> Save
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-background-surface border border-border-subtle text-xs">
            {isOnline ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-feedback-success" />
                <span className="text-text-secondary">Online</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-feedback-warning" />
                <span className="text-feedback-warning font-semibold">Offline Mode (Cached)</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Main Workspace Layout */}
      {!currentLead ? (
        <div className="p-12 text-center bg-background-card border border-border-subtle rounded-xl max-w-lg mx-auto">
          <CheckCircle className="w-12 h-12 text-feedback-success mx-auto mb-3" />
          <h2 className="text-lg font-bold text-text-primary">Queue Completed!</h2>
          <p className="text-xs text-text-secondary mt-1">
            All leads in your current daily batch have been addressed. The daily top-up cron runs at 06:00 AM IST.
          </p>
          <button
            onClick={loadLeads}
            className="mt-6 px-4 py-2 bg-background-surface hover:bg-background-elevated border border-border-subtle rounded-md text-xs text-text-primary transition-colors"
          >
            Refresh Queue
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Active Lead Hero Card (2 cols) */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-background-card border border-border-subtle rounded-xl p-6 sm:p-8 shadow-card relative overflow-hidden">
              <div className="absolute top-0 right-0 p-6 flex items-center gap-2">
                <div className="flex items-center gap-1 px-3 py-1 rounded-full bg-accent-subtle border border-accent-border text-accent-primary font-mono text-xs font-bold">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Score {currentLead.score}</span>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <span className="text-xs font-mono uppercase tracking-wider text-accent-primary">
                    Lead #{activeLeadIndex + 1} of {leads.length}
                  </span>
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-text-primary mt-1 tracking-tight">
                    {currentLead.name}
                  </h2>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-text-secondary pt-2">
                  <div className="flex items-center gap-2 p-2.5 rounded-lg bg-background-surface border border-border-subtle">
                    <MapPin className="w-4 h-4 text-accent-primary shrink-0" />
                    <span className="truncate">
                      {currentLead.area} {currentLead.address ? `• ${currentLead.address}` : ""}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 p-2.5 rounded-lg bg-background-surface border border-border-subtle">
                    <Globe className="w-4 h-4 text-accent-primary shrink-0" />
                    {currentLead.website ? (
                      <a
                        href={
                          currentLead.website.startsWith("http")
                            ? currentLead.website
                            : `https://${currentLead.website}`
                        }
                        target="_blank"
                        rel="noreferrer"
                        className="truncate text-accent-primary hover:underline"
                      >
                        {currentLead.website}
                      </a>
                    ) : (
                      <span className="text-text-muted">No website on file</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 p-2.5 rounded-lg bg-background-surface border border-border-subtle">
                    <span className="font-mono text-accent-primary">Niche:</span>
                    <span className="capitalize font-medium text-text-primary">
                      {currentLead.niche}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 p-2.5 rounded-lg bg-background-surface border border-border-subtle">
                    <Clock className="w-4 h-4 text-accent-primary shrink-0" />
                    <span>
                      Attempts:{" "}
                      <strong className="text-text-primary">{currentLead.attempts_count}</strong>
                    </span>
                  </div>
                </div>

                {currentLead.next_callback_at && (
                  <div className="p-3 rounded-lg bg-feedback-warning/10 border border-feedback-warning/20 text-feedback-warning text-xs flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    <span>
                      Scheduled Callback:{" "}
                      <strong>{new Date(currentLead.next_callback_at).toLocaleString()}</strong>
                    </span>
                  </div>
                )}

                {/* Primary Dial CTA */}
                <div className="pt-4 flex flex-col sm:flex-row items-center gap-4">
                  <button
                    onClick={handleStartCall}
                    className="w-full sm:w-auto flex-1 py-4 px-6 bg-accent-primary hover:bg-accent-hover active:bg-accent-active text-background-base font-bold text-sm uppercase tracking-wider rounded-lg shadow-glow flex items-center justify-center gap-3 transition-transform active:scale-[0.99]"
                  >
                    <PhoneCall className="w-5 h-5 animate-pulse" />
                    <span>Call Now ({currentLead.normalized_phone || currentLead.phone})</span>
                  </button>

                  <button
                    onClick={() => setIsDrawerOpen(true)}
                    className="w-full sm:w-auto py-4 px-5 bg-background-surface hover:bg-background-elevated border border-border-subtle rounded-lg text-xs font-semibold text-text-primary transition-colors flex items-center justify-center gap-2"
                  >
                    <span>Log Outcome</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Embedded Activity & Internal Thread */}
            <EntityComments entityType="lead" entityId={currentLead.id} />
          </div>

          {/* Up Next Queue Sidebar (1 col) */}
          <div className="bg-background-surface border border-border-subtle rounded-xl p-4 flex flex-col h-[640px]">
            <div className="flex items-center justify-between pb-3 border-b border-border-subtle">
              <span className="text-xs font-bold uppercase tracking-wider text-text-primary font-mono">
                Upcoming Queue
              </span>
              <span className="text-xs text-text-muted">{leads.length} in deck</span>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-border-subtle mt-2">
              {leads.map((lead, idx) => (
                <button
                  key={lead.id}
                  onClick={() => setActiveLeadIndex(idx)}
                  className={`w-full text-left p-3 rounded-lg transition-colors flex items-center justify-between gap-3 ${
                    idx === activeLeadIndex
                      ? "bg-background-elevated border border-accent-border/40"
                      : "hover:bg-background-elevated/40"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-text-primary truncate">
                      {lead.name}
                    </p>
                    <p className="text-[11px] text-text-muted truncate">
                      {lead.niche} • {lead.area}
                    </p>
                  </div>

                  <span className="text-[11px] font-mono font-bold text-accent-primary shrink-0">
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
        <div className="fixed inset-0 z-[200] bg-background-base/80 backdrop-blur-sm flex justify-end">
          <div className="w-full max-w-md bg-background-surface border-l border-border-subtle h-full flex flex-col shadow-modal animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="p-4 border-b border-border-subtle bg-background-elevated/40 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-accent-primary">
                  Post-Call Disposition
                </span>
                <h3 className="text-sm font-bold text-text-primary truncate max-w-[280px]">
                  {currentLead.name}
                </h3>
              </div>
              <button
                onClick={() => setIsDrawerOpen(false)}
                className="text-text-muted hover:text-text-primary text-xs px-2 py-1 rounded"
              >
                Cancel
              </button>
            </div>

            {/* Outcome Selection Buttons (Hotkeys 1-7) */}
            <div className="p-4 flex-1 overflow-y-auto space-y-4">
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-2">
                  Select Call Outcome (Press 1 - 7)
                </label>
                <div className="grid grid-cols-1 gap-2">
                  {OUTCOMES.map((item) => (
                    <button
                      key={item.value}
                      onClick={() => setSelectedOutcome(item.value)}
                      className={`px-3 py-2.5 rounded-lg border text-left flex items-center justify-between transition-all ${
                        selectedOutcome === item.value
                          ? "bg-accent-subtle border-accent-primary text-accent-primary font-bold shadow-glow"
                          : "bg-background-card border-border-subtle text-text-secondary hover:border-border-strong hover:text-text-primary"
                      }`}
                    >
                      <span className="text-xs">{item.label}</span>
                      <kbd className="px-1.5 py-0.5 rounded bg-background-base border border-border-subtle font-mono text-[10px] text-text-muted">
                        {item.key}
                      </kbd>
                    </button>
                  ))}
                </div>
              </div>

              {selectedOutcome === "callback" && (
                <div>
                  <label className="block text-xs font-medium text-accent-primary mb-1">
                    Callback Date & Time
                  </label>
                  <input
                    type="datetime-local"
                    value={callbackDateTime}
                    onChange={(e) => setCallbackDateTime(e.target.value)}
                    className="w-full px-3 py-2 bg-background-input border border-border-subtle focus:border-border-focus rounded-md text-xs text-text-primary outline-none"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-text-secondary mb-1">
                  Call Notes & Objections
                </label>
                <textarea
                  ref={notesInputRef}
                  rows={3}
                  value={callNotes}
                  onChange={(e) => setCallNotes(e.target.value)}
                  placeholder="Key objections, gatekeeper details, next actions..."
                  className="w-full p-2.5 bg-background-input border border-border-subtle focus:border-border-focus rounded-md text-xs text-text-primary placeholder:text-text-placeholder outline-none resize-none"
                />
              </div>
            </div>

            {/* Submit Action */}
            <div className="p-4 border-t border-border-subtle bg-background-elevated/40">
              <button
                onClick={handleSubmitOutcome}
                disabled={isSubmitting}
                className="w-full py-3 px-4 bg-accent-primary hover:bg-accent-hover active:bg-accent-active text-background-base font-bold text-xs uppercase tracking-wider rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Recording & Advancing...
                  </>
                ) : (
                  <>
                    <span>Submit & Next Lead</span>
                    <kbd className="px-1.5 py-0.5 rounded bg-background-base/20 font-mono text-[10px]">
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
