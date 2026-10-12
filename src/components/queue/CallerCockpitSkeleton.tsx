"use client";

import React from "react";
import { Loader2 } from "lucide-react";

export function CallerCockpitSkeleton({ embedded = false }: { embedded?: boolean }) {
  return (
    <div
      className={`w-full max-w-[420px] mx-auto bg-[#0c0c0e] text-zinc-100 flex flex-col items-center justify-center select-none font-sans ${
        embedded
          ? "h-full min-h-full"
          : "min-h-screen sm:border-x sm:border-[#202025]"
      }`}
    >
      <div className="flex flex-col items-center justify-center p-6 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#F95721] mb-3" />
        <span className="text-xs font-mono text-zinc-400 font-medium tracking-wide">
          Loading cockpit...
        </span>
      </div>
    </div>
  );
}
