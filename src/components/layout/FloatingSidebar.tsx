"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  PhoneCall,
  FolderKanban,
  MessageSquare,
  Users,
  Plus,
  Settings,
  LogOut,
  Bell,
  Sparkles,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { NotificationBell } from "@/components/comms/NotificationBell";

export function FloatingSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [profile, setProfile] = useState<{ full_name: string; role: string } | null>(null);
  const supabase = createClient();

  useEffect(() => {
    async function loadUser() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const { data } = await supabase
          .from("profiles")
          .select("full_name, role")
          .eq("id", user.id)
          .maybeSingle();

        if (data) setProfile(data);
      } catch (err) {
        // Fallback gracefully
      }
    }
    loadUser();
  }, [supabase]);

  async function handleLogout() {
    try {
      await supabase.auth.signOut();
    } catch (e) {}
    document.cookie = "agency_demo_role=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    router.push("/studio/login");
  }

  const role = profile?.role || "manager";

  const navItems = [
    {
      label: "Dashboard",
      href: "/studio/dashboard",
      icon: LayoutDashboard,
      roles: ["manager", "admin"],
    },
    {
      label: "Dial Queue",
      href: "/studio/queue",
      icon: PhoneCall,
      roles: ["caller", "manager", "admin"],
    },
    {
      label: "Projects",
      href: "/studio/projects",
      icon: FolderKanban,
      roles: ["developer", "manager", "admin"],
    },
    {
      label: "Comms & DMs",
      href: "/studio/comms",
      icon: MessageSquare,
      roles: ["caller", "developer", "manager", "admin"],
    },
    {
      label: "Team Center",
      href: "/studio/manager/team",
      icon: Users,
      roles: ["manager", "admin"],
    },
  ];

  return (
    <aside className="hidden lg:flex fixed top-4 left-4 bottom-4 w-60 z-50 rounded-3xl bg-white/70 dark:bg-white/[0.04] backdrop-blur-2xl border border-black/[0.08] dark:border-white/[0.14] shadow-[0_20px_50px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.25)] flex-col justify-between p-4 transition-all overflow-hidden group">
      {/* Specular glass reflection at top */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-white/[0.08] to-transparent" />
      {/* Internal ambient aura */}
      <div className="pointer-events-none absolute -top-10 -left-10 w-36 h-36 bg-white/[0.03] rounded-full blur-2xl" />
      <div className="pointer-events-none absolute -bottom-10 -right-10 w-36 h-36 bg-[#7F3922]/15 rounded-full blur-2xl" />
      {/* Top Section */}
      <div className="space-y-4">
        {/* Workspace Brand Pill */}
        <div className="flex items-center gap-2.5 px-1 py-1">
          <div className="w-6 h-6 flex items-center justify-center font-bold text-xs text-[#9F5639] shrink-0 font-mono">
            {profile?.full_name ? profile.full_name[0].toUpperCase() : "M"}
          </div>
          <div className="min-w-0">
            <h2 className="text-xs font-bold text-[#111110] dark:text-[#F5F3EF] truncate tracking-tight uppercase font-mono">
              {profile?.full_name?.replace(/\(owner\)/i, "(Admin)") || "MUZAMMIL (ADMIN)"}
            </h2>
            <p className="text-[10px] text-[#6E6B66] dark:text-[#8A8680] truncate font-medium">
              Agency OS • <span className="capitalize">{role}</span>
            </p>
          </div>
        </div>

        <Link
          href={role === "caller" ? "/queue" : role === "developer" ? "/projects" : "/manager/ingestion"}
          className="relative w-full py-2.5 px-3 bg-gradient-to-b from-[#8E4128]/95 to-[#6E2E1A]/95 hover:from-[#9E4A2F] hover:to-[#7E351F] border border-[#D97755]/50 text-white rounded-full font-semibold text-xs shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_4px_14px_rgba(127,57,34,0.35)] flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] overflow-hidden"
        >
          <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/20 to-transparent rounded-t-full" />
          <Plus className="w-3.5 h-3.5 stroke-[2.5] relative z-10" />
          <span className="relative z-10">{role === "caller" ? "Start Dialing" : role === "developer" ? "New Task" : "Import Leads"}</span>
        </Link>

        {/* Vertical Nav Stack */}
        <nav className="space-y-1 pt-2">
          {navItems
            .filter((item) => item.roles.includes(role))
            .map((item) => {
              const Icon = item.icon;
              const isManagerSection = item.href.includes("/manager");
              const isActive = isManagerSection
                ? pathname.includes("/manager")
                : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs transition-all overflow-hidden ${
                    isActive
                      ? "bg-gradient-to-b from-[#8E4128]/90 to-[#6E2E1A]/90 border border-[#D97755]/50 text-white font-semibold shadow-[inset_0_1px_1px_rgba(255,255,255,0.35),0_4px_12px_rgba(127,57,34,0.3)]"
                      : "text-[#6E6B66] dark:text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF] hover:bg-black/5 dark:hover:bg-white/[0.05] font-medium"
                  }`}
                >
                  {isActive && (
                    <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/15 to-transparent rounded-t-xl" />
                  )}
                  <Icon
                    className={`w-4 h-4 shrink-0 relative z-10 ${
                      isActive ? "text-white stroke-[2.2]" : "text-[#6E6B66] dark:text-[#8A8680]"
                    }`}
                  />
                  <span className="truncate relative z-10">{item.label}</span>
                </Link>
              );
            })}
        </nav>
      </div>

      {/* Bottom Controls */}
      <div className="pt-4 border-t border-[#ECE8E1]/80 dark:border-white/10 space-y-2 relative z-10">
        <div className="flex items-center justify-between px-1">
          <ThemeToggle />
          <NotificationBell />
          <button
            onClick={handleLogout}
            title="Sign out"
            className="p-2 rounded-xl text-[#6E6B66] dark:text-[#8A8680] hover:text-feedback-error hover:bg-black/5 dark:hover:bg-white/5 transition-all"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
