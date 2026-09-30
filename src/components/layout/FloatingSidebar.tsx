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
    router.push("/login");
  }

  const role = profile?.role || "manager";

  const navItems = [
    {
      label: "Dashboard",
      href: "/dashboard",
      icon: LayoutDashboard,
      roles: ["manager", "admin"],
    },
    {
      label: "Dial Queue",
      href: "/queue",
      icon: PhoneCall,
      roles: ["caller", "manager", "admin"],
    },
    {
      label: "Projects",
      href: "/projects",
      icon: FolderKanban,
      roles: ["developer", "manager", "admin"],
    },
    {
      label: "Comms & DMs",
      href: "/comms",
      icon: MessageSquare,
      roles: ["caller", "developer", "manager", "admin"],
    },
    {
      label: "Team Center",
      href: "/manager/team",
      icon: Users,
      roles: ["manager", "admin"],
    },
  ];

  return (
    <aside className="hidden lg:flex fixed top-4 left-4 bottom-4 w-60 z-50 rounded-3xl bg-white dark:bg-[#1C1A17] border border-[#ECE8E1] dark:border-[#2D2924] shadow-island dark:shadow-islandDark flex-col justify-between p-4 transition-colors">
      {/* Top Section */}
      <div className="space-y-4">
        {/* Workspace Brand Pill */}
        <div className="flex items-center gap-3 px-1 py-1">
          <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-[#F95721] to-[#FF8A65] p-0.5 shadow-sm">
            <div className="w-full h-full rounded-full bg-white dark:bg-[#1C1A17] flex items-center justify-center font-bold text-xs text-[#F95721]">
              {profile?.full_name ? profile.full_name[0].toUpperCase() : "M"}
            </div>
          </div>
          <div className="min-w-0">
            <h2 className="text-xs font-bold text-[#111110] dark:text-[#F5F3EF] truncate tracking-tight uppercase font-mono">
              {profile?.full_name || "MUZAMMIL"}
            </h2>
            <p className="text-[10px] text-[#6E6B66] dark:text-[#8A8680] truncate font-medium">
              Agency OS • <span className="capitalize">{role}</span>
            </p>
          </div>
        </div>

        {/* Primary Action Button (Matches Simpliscale reference) */}
        <Link
          href={role === "caller" ? "/queue" : role === "developer" ? "/projects" : "/manager/ingestion"}
          className="w-full py-2.5 px-3 bg-[#F95721] hover:bg-[#E04612] text-white rounded-full font-semibold text-xs shadow-sm flex items-center justify-center gap-1.5 transition-all active:scale-[0.98]"
        >
          <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>{role === "caller" ? "Start Dialing" : role === "developer" ? "New Task" : "Import Leads"}</span>
        </Link>

        {/* Vertical Nav Stack */}
        <nav className="space-y-1 pt-2">
          {navItems
            .filter((item) => item.roles.includes(role))
            .map((item) => {
              const Icon = item.icon;
              const isActive =
                item.href === "/manager/team"
                  ? pathname.startsWith("/manager")
                  : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs transition-all ${
                    isActive
                      ? "bg-[#F95721] text-white font-semibold shadow-sm"
                      : "text-[#6E6B66] dark:text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF] hover:bg-black/5 dark:hover:bg-white/5 font-medium"
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      isActive ? "text-white stroke-[2.2]" : "text-[#6E6B66] dark:text-[#8A8680]"
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
        </nav>
      </div>

      {/* Bottom Controls */}
      <div className="pt-4 border-t border-[#ECE8E1] dark:border-[#2D2924] space-y-2">
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
