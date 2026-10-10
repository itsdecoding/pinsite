"use client";

import React, { Suspense, useEffect, useState } from "react";
import { Search, Command } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

function CommandBarContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isMirroring = Boolean(searchParams.get("impersonate"));

  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      } else if (e.key === "Escape") {
        setIsOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  if (isMirroring) return null;

  const commands = [
    { label: "Go to Operations Dashboard", href: "/studio/dashboard" },
    { label: "Open Outbound Dial Queue", href: "/studio/queue" },
    { label: "Open Team Command Center", href: "/studio/manager/team" },
    { label: "Open Quarantine Holding Bin", href: "/studio/manager/quarantine" },
    { label: "Open Web Projects Kanban", href: "/studio/projects" },
    { label: "Open Realtime Team Comms", href: "/studio/comms" },
    { label: "Upload Leads CSV", href: "/studio/manager/ingestion" },
    { label: "Manage Team Invites", href: "/studio/manager/invites" },
  ];

  const filtered = commands.filter((c) =>
    c.label.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="hidden md:block relative max-w-md w-full mx-auto mb-6">
      <button
        onClick={() => setIsOpen(true)}
        className="relative w-full flex items-center justify-between px-4 py-2.5 rounded-full bg-white/70 dark:bg-white/[0.04] backdrop-blur-2xl border border-black/[0.08] dark:border-white/[0.14] shadow-[0_4px_20px_rgba(0,0,0,0.3),inset_0_1px_1px_rgba(255,255,255,0.25)] hover:border-[#D97755]/50 text-xs text-[#6E6B66] dark:text-[#8A8680] transition-all overflow-hidden group"
      >
        <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/[0.08] to-transparent rounded-t-full" />
        <div className="flex items-center gap-2 relative z-10">
          <Search className="w-3.5 h-3.5 text-[#9F5639]" />
          <span>Search or run a command...</span>
        </div>
        <kbd className="relative z-10 px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 font-mono text-[10px] text-[#6E6B66] dark:text-[#8A8680] flex items-center gap-0.5">
          <Command className="w-2.5 h-2.5" /> K
        </kbd>
      </button>

      {/* Modal Dropdown */}
      {isOpen && (
        <div className="fixed inset-0 z-[300] bg-black/60 backdrop-blur-md flex items-start justify-center pt-24 px-4">
          <div
            className="w-full max-w-lg rounded-2xl bg-white/85 dark:bg-[#131414]/85 backdrop-blur-2xl border border-black/10 dark:border-[#55514B] shadow-2xl dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)] overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3 border-b border-[#ECE8E1] dark:border-[#55514B]/60 flex items-center gap-2">
              <Search className="w-4 h-4 text-[#9F5639] shrink-0" />
              <input
                type="text"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Type a command or jump to page..."
                className="w-full text-xs bg-transparent text-[#111110] dark:text-[#F5F3EF] outline-none placeholder:text-[#6E6B66]"
              />
              <button
                onClick={() => setIsOpen(false)}
                className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 text-[#6E6B66]"
              >
                ESC
              </button>
            </div>

            <div className="max-h-64 overflow-y-auto p-2 divide-y divide-[#ECE8E1]/50 dark:divide-[#55514B]/30">
              {filtered.length === 0 ? (
                <div className="p-4 text-center text-xs text-[#6E6B66]">
                  No matching commands found.
                </div>
              ) : (
                filtered.map((cmd) => (
                  <button
                    key={cmd.href}
                    onClick={() => {
                      router.push(cmd.href);
                      setIsOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs text-[#111110] dark:text-[#F5F3EF] hover:bg-[#7F3922] hover:text-white flex items-center justify-between group transition-colors"
                  >
                    <span>{cmd.label}</span>
                    <span className="text-[10px] font-mono text-[#6E6B66] group-hover:text-white/80">
                      Jump &rarr;
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function CommandBar() {
  return (
    <Suspense fallback={null}>
      <CommandBarContent />
    </Suspense>
  );
}
