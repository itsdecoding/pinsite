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
  { key: "1", label: "No Answer", value: "no_answer" },
  { key: "2", label: "Gatekeeper", value: "gatekeeper" },
  { key: "3", label: "DM Reached", value: "dm_reached" },
  { key: "4", label: "Interested", value: "interested" },
  { key: "5", label: "Callback", value: "callback" },
  { key: "6", label: "DNC", value: "dnc" },
  { key: "7", label: "Not Interested", value: "not_interested" },
];

export default function CallerQueuePage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [totalPoolCount, setTotalPoolCount] = useState<number | null>(null);
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

  const supabase = createClient();
  const notesInputRef = useRef<HTMLTextAreaElement>(null);

  const loadLeads = useCallback(async () => {
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

      // 1. Check total unassigned/assigned pool in the database
      const { count: poolCount } = await supabase
        .from("leads")
        .select("*", { count: "exact", head: true })
        .is("deleted_at", null);

      setTotalPoolCount(poolCount || 0);

      // 2. Fetch leads assigned to current caller
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .eq("assigned_to", user.id)
        .is("deleted_at", null)
        .not("status", "in", '("closed_won","closed_lost","dnc")')
        .order("next_callback_at", { ascending: true, nullsFirst: false })
        .order("score", { ascending: false });

      if (error) throw error;

      if (data && data.length > 0) {
        setLeads(data);
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
  }, [supabase]);

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

    const payload = {
      p_lead_id: currentLead.id,
      p_status: selectedOutcome,
      p_callback_at: selectedOutcome === "callback" && callbackDateTime ? callbackDateTime : null,
      p_notes: callNotes.trim() || null,
      p_duration_seconds: duration,
    };

    try {
      if (isOnline) {
        await supabase.rpc("caller_update_lead", payload);
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
        setLeads((prev) => prev.filter((_, idx) => idx !== activeLeadIndex));
      }, 120);
    } catch (err: any) {
      alert(`Error updating call: ${err.message}`);
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
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
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 text-[#6E6B66] dark:text-[#8A8680]">
        <Loader2 className="w-8 h-8 animate-spin text-[#F95721]" />
        <p className="text-xs font-mono uppercase tracking-wider">Syncing Outbound Deck...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-2">
        <div>
          <span className="text-[11px] font-mono tracking-widest uppercase text-[#F95721] font-semibold">
            CALLER WORKSPACE
          </span>
          <h1 className="text-3xl sm:text-4xl font-black text-[#111110] dark:text-[#F5F3EF] tracking-tight mt-1">
            High-velocity speed dialing.
          </h1>
          <p className="text-xs text-[#6E6B66] dark:text-[#8A8680] mt-1.5">
            Hotkeys: <kbd className="px-1.5 py-0.5 rounded-md bg-black/5 dark:bg-white/10 font-mono text-[10px]">Space</kbd> Dial • <kbd className="px-1.5 py-0.5 rounded-md bg-black/5 dark:bg-white/10 font-mono text-[10px]">1-7</kbd> Outcome • <kbd className="px-1.5 py-0.5 rounded-md bg-black/5 dark:bg-white/10 font-mono text-[10px]">Enter</kbd> Save & Next
          </p>
        </div>

        <div className="flex items-center gap-3">
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
        </div>
      </div>

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
        ) : (
          <div className="p-12 text-center bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] rounded-3xl max-w-lg mx-auto shadow-sm">
            <CheckCircle className="w-12 h-12 text-feedback-success mx-auto mb-3" />
            <h2 className="text-lg font-bold text-[#111110] dark:text-[#F5F3EF]">Queue Complete</h2>
            <p className="text-xs text-[#6E6B66] dark:text-[#8A8680] mt-1 max-w-sm mx-auto">
              All assigned leads for this session have been dialed. Next daily 100-lead top-up executes at 06:00 AM IST.
            </p>
            <button
              onClick={loadLeads}
              className="mt-6 px-5 py-2.5 bg-[#F95721] text-white rounded-full font-semibold text-xs transition-transform active:scale-95"
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
              <div className="flex items-center justify-between pb-4 border-b border-[#ECE8E1] dark:border-[#2D2924]">
                <span className="text-xs font-mono uppercase tracking-wider text-[#F95721] font-bold">
                  Lead #{activeLeadIndex + 1} of {leads.length}
                </span>
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
                  <div className="flex items-center gap-2 p-3 rounded-2xl bg-black/5 dark:bg-white/5 border border-[#ECE8E1] dark:border-[#2D2924]">
                    <MapPin className="w-4 h-4 text-[#F95721] shrink-0" />
                    <span className="text-[#111110] dark:text-[#F5F3EF] truncate">
                      {currentLead.address || currentLead.area}
                    </span>
                  </div>

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
                        className="truncate text-[#F95721] font-semibold hover:underline"
                      >
                        {currentLead.website}
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
                  <div className="min-w-0">
                    <p className="text-xs text-[#111110] dark:text-[#F5F3EF] truncate font-bold">
                      {lead.name}
                    </p>
                    <p className="text-[11px] text-[#6E6B66] dark:text-[#8A8680] truncate mt-0.5">
                      {lead.niche} • {lead.area}
                    </p>
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
