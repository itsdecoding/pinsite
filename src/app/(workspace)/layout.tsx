import React from "react";
import { FloatingSidebar } from "@/components/layout/FloatingSidebar";
import { CommandBar } from "@/components/layout/CommandBar";

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#F7F5F0] dark:bg-[#0E0E0E] text-[#111110] dark:text-[#D4D2D0] flex transition-colors">
      {/* Floating Island Sidebar (Desktop) */}
      <FloatingSidebar />

      {/* Main Canvas Area (pl-72 gives 288px clearance for the 256px floating sidebar + 32px breathing room) */}
      <div className="flex-1 lg:pl-72 flex flex-col min-h-screen">
        <main className="flex-1 max-w-6xl w-full mx-auto px-0 sm:px-6 lg:px-8 pt-0 sm:pt-6 pb-0 lg:pb-12">
          {/* Top Command Palette ⌘K */}
          <CommandBar />

          {/* Canvas View */}
          {children}
        </main>
      </div>
    </div>
  );
}
