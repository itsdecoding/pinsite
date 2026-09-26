"use client";

import React, { useEffect, useState } from "react";
import { Search, Command } from "lucide-react";
import { useRouter } from "next/navigation";

export function CommandBar() {
  const router = useRouter();
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

  const commands = [
    { label: "Go to Operations Dashboard", href: "/dashboard" },
    { label: "Open Outbound Dial Queue", href: "/queue" },
    { label: "Open Web Projects Kanban", href: "/projects" },
    { label: "Open Realtime Team Comms", href: "/comms" },
    { label: "Upload Leads CSV", href: "/manager/ingestion" },
    { label: "Manage Team Invites", href: "/manager/invites" },
  ];

  const filtered = commands.filter((c) =>
    c.label.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="relative max-w-md w-full mx-auto mb-6">
      <button
        onClick={() => setIsOpen(true)}
        className="w-full flex items-center justify-between px-4 py-2 rounded-full bg-white/80 dark:bg-[#1C1A17]/80 backdrop-blur border border-[#ECE8E1] dark:border-[#2D2924] shadow-sm hover:border-[#F95721]/50 text-xs text-[#6E6B66] dark:text-[#8A8680] transition-all"
      >
        <div className="flex items-center gap-2">
          <Search className="w-3.5 h-3.5 text-[#F95721]" />
          <span>Search or run a command...</span>
        </div>
        <kbd className="px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 font-mono text-[10px] text-[#6E6B66] dark:text-[#8A8680] flex items-center gap-0.5">
          <Command className="w-2.5 h-2.5" /> K
        </kbd>
      </button>

      {/* Modal Dropdown */}
      {isOpen && (
        <div className="fixed inset-0 z-[300] bg-black/40 backdrop-blur-sm flex items-start justify-center pt-24 px-4">
          <div
            className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3 border-b border-[#ECE8E1] dark:border-[#2D2924] flex items-center gap-2">
              <Search className="w-4 h-4 text-[#F95721] shrink-0" />
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

            <div className="max-h-64 overflow-y-auto p-2 divide-y divide-[#ECE8E1]/50 dark:divide-[#2D2924]/50">
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
                    className="w-full text-left px-3 py-2 rounded-xl text-xs text-[#111110] dark:text-[#F5F3EF] hover:bg-[#F95721] hover:text-white flex items-center justify-between group transition-colors"
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
