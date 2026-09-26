import React from "react";
import { FloatingSidebar } from "@/components/layout/FloatingSidebar";
import { CommandBar } from "@/components/layout/CommandBar";
import { MobileNav } from "@/components/layout/MobileNav";

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#F7F5F0] dark:bg-[#141210] text-[#111110] dark:text-[#F5F3EF] flex transition-colors">
      {/* Floating Island Sidebar (Desktop) */}
      <FloatingSidebar />

      {/* Main Canvas Area */}
      <div className="flex-1 lg:pl-68 flex flex-col min-h-screen">
        <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-24 lg:pb-12">
          {/* Top Command Palette ⌘K */}
          <CommandBar />

          {/* Canvas View */}
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <MobileNav />
    </div>
  );
}
