"use client";

import React, { useEffect, useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "framer-motion";
import type { Transition } from "framer-motion";
import { X } from "lucide-react";
import { CallerCockpit } from "./CallerCockpit";

export interface CallerCockpitOverlayProps {
  caller: {
    id: string;
    full_name: string;
    email?: string;
    role: string;
    dials_today?: number;
    connects_today?: number;
    talk_time_seconds?: number;
    outcomes_breakdown?: {
      interested: number;
      callback: number;
      no_answer: number;
      not_interested: number;
      dnc: number;
    };
  };
  onClose: () => void;
}

export function CallerCockpitOverlay({ caller, onClose }: CallerCockpitOverlayProps) {
  const [mounted, setMounted] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Handle ESC key to exit
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    // Lock background scrolling on both body and html while overlay is active
    const originalBodyOverflow = document.body.style.overflow;
    const originalHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalBodyOverflow;
      document.documentElement.style.overflow = originalHtmlOverflow;
    };
  }, [handleKeyDown]);

  const transitionConfig: Transition = shouldReduceMotion
    ? { duration: 0 }
    : { duration: 0.28, ease: "easeOut" };

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] flex flex-col items-center justify-center p-2 sm:p-3 select-none overflow-hidden"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* 95% opacity dark backdrop overlay covering 100% of viewport - Zero gap, zero clicking behind */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={transitionConfig}
        className="fixed inset-0 bg-black/95 backdrop-blur-2xl"
        onClick={onClose}
      />

      {/* Top-Right Close Button [ ✕ ] */}
      <motion.button
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={transitionConfig}
        type="button"
        onClick={onClose}
        title="Close Mirror (Esc)"
        className="fixed top-3 right-3 sm:top-5 sm:right-6 z-[100010] flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white/10 hover:bg-white/20 text-white text-xs font-semibold backdrop-blur-md border border-white/20 transition-all shadow-xl active:scale-95 group cursor-pointer"
      >
        <X className="w-4 h-4 text-zinc-300 group-hover:text-white transition-colors" />
      </motion.button>

      {/* Small Banner Above Phone */}
      <motion.div
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={transitionConfig}
        className="relative z-[100005] mb-1.5 px-3 py-0.5 rounded-full bg-zinc-900/95 border border-white/15 text-xs text-zinc-300 shadow-xl backdrop-blur-md flex items-center gap-2 max-w-[90vw] text-center shrink-0"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-[#F95721] animate-pulse shrink-0" />
        <span className="text-[11px] truncate">
          Mirroring <strong className="text-white font-semibold">{caller.full_name}</strong> &mdash; Actions logged as you, credited to them
        </span>
      </motion.div>

      {/* Shared-Element Morphing Phone Frame (Scaled to ~700px max) */}
      <motion.div
        layoutId={`pipeline-box-${caller.id}`}
        transition={transitionConfig}
        onClick={(e) => e.stopPropagation()}
        className="relative z-[100000] w-[375px] sm:w-[385px] max-w-[calc(100vw-16px)] h-[min(690px,calc(100vh-44px))] rounded-[38px] border-[7px] border-[#1e1d23] bg-[#0c0c0e] shadow-[0_25px_70px_-15px_rgba(0,0,0,0.95),0_0_0_1px_rgba(255,255,255,0.08)] flex flex-col overflow-hidden"
      >
        {/* Phone Top Speaker & Dynamic Island */}
        <div className="w-24 h-3.5 rounded-full bg-black/90 mx-auto mt-1.5 shrink-0 z-50 flex items-center justify-center pointer-events-none border border-white/[0.06]">
          <div className="w-1.5 h-1.5 rounded-full bg-zinc-900 border border-zinc-700/60 mr-2" />
          <div className="w-7 h-1 rounded-full bg-zinc-800" />
        </div>

        {/* Live Cockpit inside Phone Frame verbatim */}
        <div className="flex-1 w-full overflow-hidden relative">
          <CallerCockpit
            callerId={caller.id}
            callerName={caller.full_name}
            initialStats={{
              totalDials: caller.dials_today || 0,
              connects: caller.connects_today || 0,
              totalTalkSeconds: caller.talk_time_seconds || 0,
              interested: caller.outcomes_breakdown?.interested || 0,
              callbacks: caller.outcomes_breakdown?.callback || 0,
              noAnswer: caller.outcomes_breakdown?.no_answer || 0,
              rejected: caller.outcomes_breakdown?.not_interested || 0,
              dnc: caller.outcomes_breakdown?.dnc || 0,
            }}
            viewingAs="manager"
            embedded={true}
            hideMirrorBanner={true}
          />
        </div>

        {/* Phone Bottom Home Indicator */}
        <div className="w-24 h-1 rounded-full bg-white/25 mx-auto mb-1 shrink-0 z-50 pointer-events-none" />
      </motion.div>
    </div>,
    document.body
  );
}
