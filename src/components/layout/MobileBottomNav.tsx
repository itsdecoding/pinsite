"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  PhoneCall,
  MessageSquare,
  LayoutDashboard,
  User,
  LogOut,
  X,
  Users,
} from "lucide-react";
import { useUserSession } from "@/contexts/UserSessionContext";
import { createClient } from "@/lib/supabase/client";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

export function MobileBottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, profile } = useUserSession();
  const [showProfileSheet, setShowProfileSheet] = useState(false);
  const supabase = createClient();

  const role =
    profile?.role ||
    (user?.user_metadata?.role as string) ||
    (user?.app_metadata?.role as string) ||
    "caller";

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn("Logout error:", e);
    }
    document.cookie = "agency_demo_role=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    setShowProfileSheet(false);
    router.push("/studio/login");
  };

  const getTodayHref = () => {
    if (role === "caller") return "/studio/queue";
    if (role === "developer") return "/studio/projects";
    return "/studio/dashboard";
  };

  const navItems = [
    {
      label: "Queue",
      href: role === "developer" ? "/studio/projects" : "/studio/queue",
      icon: PhoneCall,
      isAction: false,
    },
    {
      label: "Comms",
      href: "/studio/comms",
      icon: MessageSquare,
      isAction: false,
    },
    {
      label: "Today",
      href: getTodayHref(),
      icon: LayoutDashboard,
      isAction: false,
    },
    {
      label: "Profile",
      href: "#profile",
      icon: User,
      isAction: true,
    },
  ];

  return (
    <>
      {/* Mobile Profile Bottom Sheet */}
      {showProfileSheet && (
        <div
          role="dialog"
          aria-label="User Profile"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex flex-col justify-end lg:hidden animate-in fade-in duration-200"
          onClick={() => setShowProfileSheet(false)}
        >
          <div
            className="bg-white dark:bg-[#141516] border-t border-black/[0.1] dark:border-white/[0.12] rounded-t-3xl p-5 shadow-2xl space-y-4 max-w-lg w-full mx-auto animate-in slide-in-from-bottom duration-250"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-black/[0.06] dark:border-white/[0.08]">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-[#7F3922]/20 border border-[#7F3922]/40 text-[#F95721] font-bold text-sm flex items-center justify-center">
                  {(profile?.full_name || user?.email || "U").charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#111110] dark:text-[#F5F3EF]">
                    {profile?.full_name || "Muzammil"}
                  </h3>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 capitalize">
                    Agency OS • <span className="font-semibold text-[#F95721]">{role}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowProfileSheet(false)}
                className="p-1.5 rounded-full text-zinc-400 hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between p-3 rounded-2xl bg-black/[0.03] dark:bg-white/[0.04]">
                <span className="text-xs text-zinc-600 dark:text-zinc-300 font-medium">
                  Theme Appearance
                </span>
                <ThemeToggle />
              </div>

              {(role === "manager" || role === "admin") && (
                <Link
                  href="/studio/manager/team"
                  onClick={() => setShowProfileSheet(false)}
                  className="flex items-center justify-between p-3 rounded-2xl bg-black/[0.03] dark:bg-white/[0.04] text-xs font-semibold text-zinc-800 dark:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/10 transition"
                >
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-[#F95721]" />
                    <span>Team Center</span>
                  </div>
                  <span className="text-[11px] text-zinc-400">Manage</span>
                </Link>
              )}

              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 p-3 rounded-2xl bg-rose-500/10 text-rose-500 dark:text-rose-400 font-semibold text-xs hover:bg-rose-500/20 transition active:scale-98"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp / Agency OS Fixed Mobile Bottom Nav */}
      <nav
        aria-label="Mobile Navigation"
        className="fixed bottom-0 inset-x-0 lg:hidden z-40 bg-white/90 dark:bg-[#111213]/95 backdrop-blur-2xl border-t border-black/[0.08] dark:border-white/[0.12] shadow-[0_-10px_25px_rgba(0,0,0,0.2)] pb-[env(safe-area-inset-bottom)] px-3 py-1.5 transition-all"
      >
        <div className="flex items-center justify-around max-w-lg mx-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              !item.isAction &&
              (pathname === item.href ||
                pathname.startsWith(item.href) ||
                pathname === item.href.replace(/^\/studio/, "") ||
                pathname.startsWith(item.href.replace(/^\/studio/, "")));

            if (item.isAction) {
              return (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => setShowProfileSheet(true)}
                  className={`flex flex-col items-center justify-center py-1 px-3 rounded-2xl transition active:scale-95 ${
                    showProfileSheet
                      ? "text-[#F95721] font-semibold"
                      : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
                  }`}
                >
                  <div
                    className={`p-1.5 rounded-xl transition ${
                      showProfileSheet
                        ? "bg-[#7F3922]/15 text-[#F95721]"
                        : "bg-transparent text-current"
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] tracking-tight leading-none mt-0.5">
                    {item.label}
                  </span>
                </button>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center py-1 px-3 rounded-2xl transition active:scale-95 ${
                  isActive
                    ? "text-[#F95721] font-semibold"
                    : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
                }`}
              >
                <div
                  className={`p-1.5 rounded-xl transition ${
                    isActive
                      ? "bg-[#7F3922]/15 text-[#F95721]"
                      : "bg-transparent text-current"
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-[10px] tracking-tight leading-none mt-0.5">
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
