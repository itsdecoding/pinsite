import React from "react";
import { FloatingSidebar } from "@/components/layout/FloatingSidebar";
import { CommandBar } from "@/components/layout/CommandBar";
import { MobileBottomNav } from "@/components/layout/MobileBottomNav";
import { UserSessionProvider } from "@/contexts/UserSessionContext";

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <UserSessionProvider>
      <div className="min-h-screen w-full max-w-[100vw] bg-[#F7F5F0] dark:bg-[#0E0E0E] text-[#111110] dark:text-[#D4D2D0] flex transition-colors relative overflow-x-hidden">
        {/* Ambient optical background auras to give real frosted glass depth and refraction */}
        <div className="pointer-events-none fixed top-0 left-0 w-[500px] h-[500px] bg-gradient-to-br from-[#7F3922]/15 via-[#7F3922]/5 to-transparent blur-[120px] -z-10" />
        <div className="pointer-events-none fixed bottom-0 left-10 w-[400px] h-[400px] bg-gradient-to-tr from-white/[0.04] via-transparent to-transparent blur-[100px] -z-10" />

        {/* Floating Island Sidebar (Desktop) */}
        <FloatingSidebar />

        {/* Mobile Bottom Navigation Bar (< lg) */}
        <MobileBottomNav />

        {/* Main Canvas Area (pl-72 gives 288px clearance for the 256px floating sidebar + 32px breathing room) */}
        <div className="flex-1 min-w-0 w-full max-w-full lg:pl-72 flex flex-col min-h-screen overflow-x-hidden">
          <main className="flex-1 min-w-0 max-w-6xl w-full mx-auto px-0 sm:px-6 lg:px-8 pt-0 sm:pt-6 pb-20 lg:pb-12 overflow-x-hidden">
            {/* Top Command Palette ⌘K */}
            <CommandBar />

            {/* Canvas View */}
            {children}
          </main>
        </div>
      </div>
    </UserSessionProvider>
  );
}
