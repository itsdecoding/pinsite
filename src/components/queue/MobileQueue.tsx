"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { get, set } from "idb-keyval";
import { CallerCockpit, Lead, CallLogSummary } from "@/components/queue/CallerCockpit";
import { useSearchParams } from "next/navigation";

const OUTCOMES = [
  { key: "1", label: "Interested (Hot)", value: "interested", icon: "🔥", desc: "Ready for pitch / close" },
  { key: "2", label: "Callback", value: "callback", icon: "📞", desc: "Schedule follow-up date & time" },
  { key: "3", label: "No Answer", value: "no_answer", icon: "⏳", desc: "Cadence cooldown (3h / 24h / 48h / 72h)" },
  { key: "4", label: "Gatekeeper", value: "gatekeeper", icon: "🛡️", desc: "Blocked by gatekeeper (48h cooldown)" },
  { key: "5", label: "Rejected / Bad Fit", value: "not_interested", icon: "❌", desc: "Send to quarantine (enter reason)" },
  { key: "6", label: "DNC", value: "dnc", icon: "🚫", desc: "Blacklist phone number permanently" },
];

function formatDurationTimer(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function formatLeadName(rawName: string | null | undefined): string {
  if (!rawName) return "Unnamed Lead";
  let name = rawName.trim();
  name = name.replace(/([a-zA-Z0-9'’])\s*-\s*([a-zA-Z0-9])/g, "$1 - $2");
  name = name.replace(/\bDr\.([A-Za-z])/gi, "Dr. $1");
  name = name.replace(/\bDr(?!\.)\s+/gi, "Dr. ");
  name = name.replace(/\s+/g, " ").trim();
  return name;
}

export function MobileQueue() {
  const [leads, setLeads] = useState<Lead[]>([]);
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
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [latestCallNote, setLatestCallNote] = useState<CallLogSummary | null>(null);
  const [loadingNote, setLoadingNote] = useState(false);
  const [impersonatedCaller, setImpersonatedCaller] = useState<{
    id: string;
    full_name: string;
    is_online: boolean;
    dials_today: number;
  } | null>(null);

  const searchParams = useSearchParams();
  const impersonateParam = searchParams.get("impersonate");
  const supabase = createClient();
  const dialerOpenedRef = useRef(false);
  const notesInputRef = useRef<HTMLTextAreaElement>(null);
  const callActiveRef = useRef(callActive);
  const isDrawerOpenRef = useRef(isDrawerOpen);
  const currentLeadRef = useRef<Lead | null>(null);

  const currentLead = leads[activeLeadIndex] || null;

  useEffect(() => {
    callActiveRef.current = callActive;
  }, [callActive]);

  useEffect(() => {
    isDrawerOpenRef.current = isDrawerOpen;
  }, [isDrawerOpen]);

  useEffect(() => {
    currentLeadRef.current = currentLead;
  }, [currentLead]);

  // Live Call Duration Timer
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

  // Auto-open disposition drawer when returning from phone dialer
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
        setIsDrawerOpen(true);
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

  // Fetch past call note for active lead
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

  const loadLeads = useCallback(
    async (silent: boolean = false) => {
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

        const { data: profile } = await supabase
          .from("profiles")
          .select("role, full_name")
          .eq("id", user.id)
          .maybeSingle();

        const role = profile?.role || "caller";

        let activeImpersonation: { id: string; full_name: string; is_online: boolean; dials_today: number } | null = null;
        if (impersonateParam && (role === "admin" || role === "manager")) {
          const { data: callerData } = await supabase
            .from("profiles")
            .select("id, full_name, role, is_available, active")
            .eq("id", impersonateParam)
            .maybeSingle();

          if (callerData) {
            const istOffsetMs = 5.5 * 60 * 60 * 1000;
            const istNow = new Date(Date.now() + istOffsetMs);
            const istDateStr = istNow.toISOString().split("T")[0];
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
          }
        }

        const nowIso = new Date().toISOString();

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
          } else {
            q = q.eq("assigned_to", user.id);
          }

          return q
            .order("next_callback_at", { ascending: true, nullsFirst: false })
            .order("score", { ascending: false });
        };

        let { data, error } = await buildLeadQuery(true);
        if (error && (error.message?.includes("cooldown_until") || error.code === "42703")) {
          const retryRes = await buildLeadQuery(false);
          data = retryRes.data;
          error = retryRes.error;
        }

        if (error) throw error;

        if (data && data.length > 0) {
          setLeads(data);
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
      } catch (err) {
        console.warn("MobileQueue lead load fallback:", err);
        const cached = await get("cached_leads");
        if (cached && Array.isArray(cached)) setLeads(cached);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [supabase, impersonateParam]
  );

  useEffect(() => {
    loadLeads();

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    setIsOnline(navigator.onLine);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [loadLeads]);

  // 60-second cooldown auto-refresh
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isDrawerOpenRef.current && !callActiveRef.current) {
        loadLeads(true);
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [loadLeads]);

  const handleStartCall = () => {
    if (!currentLead) return;
    setCallActive(true);
    setCallStartTime(Date.now());
    dialerOpenedRef.current = true;
    if (typeof window !== "undefined") {
      sessionStorage.setItem("pinsite_dialer_active", "true");
    }
    setSelectedOutcome("no_answer");
    setCallNotes("");
    setCallbackDateTime("");
    setRejectionReason("");
    setDncConfirmed(false);
  };

  const handleSubmitOutcome = async () => {
    if (!currentLead || isSubmitting) return;

    if (selectedOutcome === "dnc" && !dncConfirmed) {
      alert("Please confirm Do Not Call (DNC) request before submitting.");
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
        if (!res.ok) throw new Error(json.error || "Failed to log outcome");
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

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-[#6E6B66] dark:text-[#8A8680]">
        <Loader2 className="w-8 h-8 animate-spin text-[#F95721]" />
        <p className="text-xs font-mono uppercase tracking-wider">Syncing Outbound Deck...</p>
      </div>
    );
  }

  return (
    <div className="w-full pb-20">
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

      {/* Slide-Up Bottom Sheet Outcome Drawer */}
      {isDrawerOpen && currentLead && (
        <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex flex-col justify-end p-0">
          <div className="absolute inset-0" onClick={() => !isSubmitting && setIsDrawerOpen(false)} />

          <div className="relative w-full bg-white dark:bg-[#1C1A17] border-t border-[#ECE8E1] dark:border-[#2D2924] rounded-t-3xl max-h-[90vh] flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-200 overflow-hidden">
            {/* Mobile drag handle */}
            <div className="w-12 h-1.5 bg-black/20 dark:bg-white/20 rounded-full mx-auto my-2.5 shrink-0" />

            {/* Drawer Header */}
            <div className="px-5 py-3 border-b border-[#ECE8E1] dark:border-[#2D2924] flex items-center justify-between shrink-0">
              <div>
                <span className="text-[10px] font-mono uppercase tracking-wider text-[#F95721] font-bold">
                  Call Disposition
                </span>
                <h3 className="text-base font-bold text-[#111110] dark:text-[#F5F3EF] truncate max-w-[220px]">
                  {formatLeadName(currentLead.name)}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                {callActive && (
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 font-mono text-xs font-bold shrink-0">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
                    <span>Talk: {formatDurationTimer(callElapsedSeconds)}</span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setIsDrawerOpen(false)}
                  className="text-xs text-[#6E6B66] dark:text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF] p-1.5 rounded-lg"
                >
                  Close
                </button>
              </div>
            </div>

            {/* Scrollable Form Body */}
            <div className="p-4 flex-1 overflow-y-auto space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-[#111110] dark:text-[#F5F3EF] mb-2">
                  Select Outcome
                </label>
                <div className="grid grid-cols-1 gap-2">
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
                            : "bg-black/5 dark:bg-white/5 border-[#ECE8E1] dark:border-[#2D2924] text-[#111110] dark:text-[#F5F3EF]"
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
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
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Conditional Callback Datetime */}
              {selectedOutcome === "callback" && (
                <div className="p-3 rounded-2xl bg-blue-500/10 border border-blue-500/20 space-y-1">
                  <label className="block text-xs font-bold text-blue-600 dark:text-blue-400">
                    📅 Callback Date & Time
                  </label>
                  <input
                    type="datetime-local"
                    value={callbackDateTime}
                    onChange={(e) => setCallbackDateTime(e.target.value)}
                    className="w-full px-3 py-2.5 bg-white dark:bg-[#1C1A17] border border-blue-500/30 rounded-xl text-xs text-[#111110] dark:text-[#F5F3EF] outline-none min-h-[44px]"
                  />
                </div>
              )}

              {/* Conditional Rejection Reason (Bad Fit) */}
              {selectedOutcome === "not_interested" && (
                <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 space-y-1">
                  <label className="block text-xs font-bold text-rose-600 dark:text-rose-400">
                    ❌ Rejection Reason <span className="text-[10px] font-normal opacity-80">(Required)</span>
                  </label>
                  <input
                    type="text"
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="e.g. Has in-house team, wrong phone, no budget..."
                    className="w-full px-3 py-2.5 bg-white dark:bg-[#1C1A17] border border-rose-500/30 rounded-xl text-xs text-[#111110] dark:text-[#F5F3EF] outline-none min-h-[44px]"
                    autoFocus
                  />
                </div>
              )}

              {/* Conditional DNC Confirmation */}
              {selectedOutcome === "dnc" && (
                <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/30 space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                    <div className="text-xs">
                      <p className="font-bold text-red-600 dark:text-red-400">Confirm Do Not Call (DNC)</p>
                      <p className="text-[11px] text-[#6E6B66] dark:text-[#8A8680] mt-0.5">
                        Permanently blacklists phone number hash across all campaigns.
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
                  rows={2}
                  value={callNotes}
                  onChange={(e) => setCallNotes(e.target.value)}
                  placeholder="Key objections, gatekeeper details, notes..."
                  className="w-full p-3 bg-black/5 dark:bg-white/5 border border-[#ECE8E1] dark:border-[#2D2924] rounded-2xl text-xs text-[#111110] dark:text-[#F5F3EF] outline-none resize-none"
                />
              </div>
            </div>

            {/* Footer Submit Button */}
            <div className="p-4 border-t border-[#ECE8E1] dark:border-[#2D2924] bg-white dark:bg-[#1C1A17] shrink-0">
              <button
                type="button"
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
                  <span>Submit & Next Lead</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
