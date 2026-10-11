"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  PhoneCall,
  FolderKanban,
  MessageSquare,
  LayoutDashboard,
  User,
  LogOut,
  X,
  Users,
  UploadCloud,
  Bell,
  Sparkles,
  Plus,
} from "lucide-react";
import { useUserSession } from "@/contexts/UserSessionContext";
import { createClient } from "@/lib/supabase/client";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { NotificationBell } from "@/components/comms/NotificationBell";
import { openPushNotificationSettings } from "@/components/notifications/PushNotificationManager";

export function MobileBottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, profile } = useUserSession();
  const [mounted, setMounted] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [showProfileSheet, setShowProfileSheet] = useState(false);
  const [unreadCommsCount, setUnreadCommsCount] = useState(0);
  const supabase = React.useMemo(() => createClient(), []);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Listen to custom events dispatched from MobileTopBar
  useEffect(() => {
    const handleOpenDrawer = () => setIsDrawerOpen(true);
    const handleOpenProfile = () => setShowProfileSheet(true);

    window.addEventListener("open-mobile-drawer", handleOpenDrawer);
    window.addEventListener("open-mobile-profile", handleOpenProfile);

    return () => {
      window.removeEventListener("open-mobile-drawer", handleOpenDrawer);
      window.removeEventListener("open-mobile-profile", handleOpenProfile);
    };
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    let isMounted = true;

    async function loadUnreadCount() {
      try {
        const res = await fetch("/api/messages/unread");
        if (res.ok) {
          const data = await res.json();
          if (isMounted && typeof data.unread_count === "number") {
            setUnreadCommsCount(data.unread_count);
          }
        }
      } catch (e) {
        // Ignore
      }
    }

    loadUnreadCount();

    // Listen to live comms unread updates dispatched from CommsDirectory
    const handleCommsUnread = (e: any) => {
      if (typeof e.detail?.count === "number" && isMounted) {
        setUnreadCommsCount(e.detail.count);
      }
    };
    window.addEventListener("comms-unread-updated", handleCommsUnread);

    const ch = supabase
      .channel(`mobile-unread-badge-${user.id}-${Math.random().toString(36).substring(2, 7)}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "dm_messages",
        },
        () => {
          loadUnreadCount();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          loadUnreadCount();
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      window.removeEventListener("comms-unread-updated", handleCommsUnread);
      supabase.removeChannel(ch);
    };
  }, [user?.id, supabase]);

  const cachedRole = React.useMemo(() => {
    if (typeof window !== "undefined") {
      try {
        return (
          localStorage.getItem("agency_user_role") ||
          (document.cookie.match(/agency_cached_role=([^;]+)/)?.[1] ?? null) ||
          (document.cookie.match(/agency_demo_role=([^;]+)/)?.[1] ?? null)
        );
      } catch {}
    }
    return null;
  }, []);

  const role = React.useMemo(() => {
    const rawRole =
      profile?.role ||
      cachedRole ||
      (user?.user_metadata?.role as string) ||
      (user?.app_metadata?.role as string);

    if (rawRole) return rawRole.toLowerCase();
    if (pathname.includes("/manager") || pathname.includes("/dashboard")) return "admin";
    if (pathname.includes("/queue")) return "caller";
    if (pathname.includes("/projects")) return "developer";
    return "admin";
  }, [profile?.role, cachedRole, user, pathname]);

  const isManagerOrAdmin = role === "admin" || role === "manager" || role === "owner";
  const isCaller = role === "caller";
  const isDashboardPage =
    pathname === "/dashboard" ||
    pathname.startsWith("/studio/dashboard") ||
    pathname.startsWith("/dashboard");

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn("Logout error:", e);
    }
    document.cookie = "agency_demo_role=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    setShowProfileSheet(false);
    setIsDrawerOpen(false);
    router.push("/studio/login");
  };

  // Drawer items for Manager / Admin (all 6 items)
  const drawerItems = React.useMemo(() => {
    return [
      {
        id: "dashboard",
        label: "Dashboard",
        href: "/studio/dashboard",
        icon: LayoutDashboard,
        isActive: pathname.startsWith("/studio/dashboard") || pathname === "/dashboard",
      },
      {
        id: "queue",
        label: "Dial Queue",
        href: "/studio/queue",
        icon: PhoneCall,
        isActive: pathname.startsWith("/studio/queue") || pathname === "/queue",
      },
      {
        id: "projects",
        label: "Projects",
        href: "/studio/projects",
        icon: FolderKanban,
        isActive: pathname.startsWith("/studio/projects") || pathname === "/projects",
      },
      {
        id: "comms",
        label: "Comms & DMs",
        href: "/studio/comms",
        icon: MessageSquare,
        badge: unreadCommsCount,
        isActive: pathname.startsWith("/studio/comms") || pathname === "/comms",
      },
      {
        id: "team",
        label: "Team Center",
        href: "/studio/manager/team",
        icon: Users,
        isActive:
          (pathname.startsWith("/studio/manager") || pathname.startsWith("/manager")) &&
          !pathname.includes("/ingestion"),
      },
      {
        id: "ingestion",
        label: "Import Leads",
        href: "/studio/manager/ingestion",
        icon: UploadCloud,
        isActive: pathname.startsWith("/studio/manager/ingestion") || pathname === "/manager/ingestion",
      },
    ];
  }, [pathname, unreadCommsCount]);

  // Bottom nav 4 shortcuts mapped strictly per role
  const navItems = React.useMemo(() => {
    if (isManagerOrAdmin) {
      return [
        {
          id: "team",
          label: "Team Center",
          href: "/studio/manager/team",
          icon: Users,
          isAction: false,
          isActive:
            (pathname.startsWith("/studio/manager") || pathname.startsWith("/manager")) &&
            !pathname.includes("/ingestion"),
        },
        {
          id: "queue",
          label: "Dial Queue",
          href: "/studio/queue",
          icon: PhoneCall,
          isAction: false,
          isActive: pathname.startsWith("/studio/queue") || pathname === "/queue",
        },
        {
          id: "comms",
          label: "Comms",
          href: "/studio/comms",
          icon: MessageSquare,
          isAction: false,
          badge: unreadCommsCount,
          isActive: pathname.startsWith("/studio/comms") || pathname === "/comms",
        },
        {
          id: "profile",
          label: "Profile",
          href: "#profile",
          icon: User,
          isAction: true,
          isActive: showProfileSheet,
        },
      ];
    }

    if (isCaller) {
      return [
        {
          id: "queue",
          label: "Queue",
          href: "/studio/queue",
          icon: PhoneCall,
          isAction: false,
          isActive: pathname.startsWith("/studio/queue") || pathname === "/queue",
        },
        {
          id: "comms",
          label: "Comms",
          href: "/studio/comms",
          icon: MessageSquare,
          isAction: false,
          badge: unreadCommsCount,
          isActive: pathname.startsWith("/studio/comms") || pathname === "/comms",
        },
        {
          id: "today",
          label: "Today",
          href: "/studio/queue",
          icon: LayoutDashboard,
          isAction: false,
          isActive: false,
        },
        {
          id: "profile",
          label: "Profile",
          href: "#profile",
          icon: User,
          isAction: true,
          isActive: showProfileSheet,
        },
      ];
    }

    // Default Developer nav
    return [
      {
        id: "projects",
        label: "Projects",
        href: "/studio/projects",
        icon: FolderKanban,
        isAction: false,
        isActive: pathname.startsWith("/studio/projects") || pathname === "/projects",
      },
      {
        id: "comms",
        label: "Comms",
        href: "/studio/comms",
        icon: MessageSquare,
        isAction: false,
        badge: unreadCommsCount,
        isActive: pathname.startsWith("/studio/comms") || pathname === "/comms",
      },
      {
        id: "today",
        label: "Today",
        href: "/studio/projects",
        icon: LayoutDashboard,
        isAction: false,
        isActive: false,
      },
      {
        id: "profile",
        label: "Profile",
        href: "#profile",
        icon: User,
        isAction: true,
        isActive: showProfileSheet,
      },
    ];
  }, [isManagerOrAdmin, isCaller, pathname, showProfileSheet, unreadCommsCount]);

  // Prevent SSR hydration duplication on client mount
  if (!mounted) {
    return null;
  }

  return (
    <>
      {/* ======================================================== */}
      {/* MOBILE FLOATING ISLAND SIDEBAR DRAWER (Opens via ☰)      */}
      {/* ======================================================== */}
      {isDrawerOpen && (
        <div
          role="dialog"
          aria-label="Navigation Drawer"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm lg:hidden p-3 sm:p-4 flex items-start animate-in fade-in duration-200"
          onClick={() => setIsDrawerOpen(false)}
        >
          <aside
            className="w-64 max-w-[85vw] h-[calc(100dvh-1.5rem)] rounded-3xl bg-white/90 dark:bg-white/[0.04] backdrop-blur-2xl border border-black/[0.08] dark:border-white/[0.14] shadow-[0_20px_50px_rgba(0,0,0,0.5),inset_0_1px_1px_rgba(255,255,255,0.25)] flex flex-col justify-between p-4 transition-all overflow-hidden relative group animate-in slide-in-from-left duration-250"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Specular glass reflection at top */}
            <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-white/[0.08] to-transparent" />
            {/* Internal ambient aura */}
            <div className="pointer-events-none absolute -top-10 -left-10 w-36 h-36 bg-white/[0.03] rounded-full blur-2xl" />
            <div className="pointer-events-none absolute -bottom-10 -right-10 w-36 h-36 bg-[#7F3922]/15 rounded-full blur-2xl" />

            {/* Top Section */}
            <div className="space-y-4 relative z-10">
              {/* Workspace Brand Pill with Close button */}
              <div className="flex items-center justify-between px-1 py-1">
                <div className="flex items-center gap-2.5 min-w-0">
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
                <button
                  type="button"
                  onClick={() => setIsDrawerOpen(false)}
                  className="p-1 rounded-full text-[#6E6B66] dark:text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF] hover:bg-black/5 dark:hover:bg-white/10 shrink-0 ml-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Primary Action Pill (+ Import Leads / + Start Dialing / + New Task) */}
              <Link
                href={role === "caller" ? "/studio/queue" : role === "developer" ? "/studio/projects" : "/studio/manager/ingestion"}
                onClick={() => setIsDrawerOpen(false)}
                className="relative w-full py-2.5 px-3 bg-gradient-to-b from-[#8E4128]/95 to-[#6E2E1A]/95 hover:from-[#9E4A2F] hover:to-[#7E351F] border border-[#D97755]/50 text-white rounded-full font-semibold text-xs shadow-[inset_0_1px_1px_rgba(255,255,255,0.4),0_4px_14px_rgba(127,57,34,0.35)] flex items-center justify-center gap-1.5 transition-all active:scale-[0.98] overflow-hidden"
              >
                <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/20 to-transparent rounded-t-full" />
                <Plus className="w-3.5 h-3.5 stroke-[2.5] relative z-10" />
                <span className="relative z-10">
                  {role === "caller" ? "Start Dialing" : role === "developer" ? "New Task" : "Import Leads"}
                </span>
              </Link>

              {/* Vertical Nav Stack */}
              <nav className="space-y-1 pt-2">
                {[
                  {
                    label: "Dashboard",
                    href: "/studio/dashboard",
                    icon: LayoutDashboard,
                    roles: ["manager", "admin"],
                    isActive: pathname.startsWith("/studio/dashboard") || pathname === "/dashboard",
                  },
                  {
                    label: "Dial Queue",
                    href: "/studio/queue",
                    icon: PhoneCall,
                    roles: ["caller", "manager", "admin"],
                    isActive: pathname.startsWith("/studio/queue") || pathname === "/queue",
                  },
                  {
                    label: "Projects",
                    href: "/studio/projects",
                    icon: FolderKanban,
                    roles: ["developer", "manager", "admin"],
                    isActive: pathname.startsWith("/studio/projects") || pathname === "/projects",
                  },
                  {
                    label: "Comms & DMs",
                    href: "/studio/comms",
                    icon: MessageSquare,
                    roles: ["caller", "developer", "manager", "admin"],
                    isActive: pathname.startsWith("/studio/comms") || pathname === "/comms",
                  },
                  {
                    label: "Team Center",
                    href: "/studio/manager/team",
                    icon: Users,
                    roles: ["manager", "admin"],
                    isActive:
                      (pathname.startsWith("/studio/manager") || pathname.startsWith("/manager")) &&
                      !pathname.includes("/ingestion"),
                  },
                ]
                  .filter((item) => item.roles.includes(role))
                  .map((item) => {
                    const Icon = item.icon;
                    const isActive = item.isActive;

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => {
                          setIsDrawerOpen(false);
                          if (item.href.includes("/comms") && typeof window !== "undefined") {
                            window.dispatchEvent(new CustomEvent("reset-comms-view"));
                          }
                        }}
                        className={`relative w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs transition-all overflow-hidden ${
                          isActive
                            ? "bg-gradient-to-b from-[#8E4128]/90 to-[#6E2E1A]/90 border border-[#D97755]/50 text-white font-semibold shadow-[inset_0_1px_1px_rgba(255,255,255,0.35),0_4px_12px_rgba(127,57,34,0.3)]"
                            : "text-[#6E6B66] dark:text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF] hover:bg-black/5 dark:hover:bg-white/[0.05] font-medium"
                        }`}
                      >
                        {isActive && (
                          <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/15 to-transparent rounded-t-xl" />
                        )}
                        <div className="flex items-center gap-3 min-w-0 relative z-10">
                          <Icon
                            className={`w-4 h-4 shrink-0 ${
                              isActive ? "text-white stroke-[2.2]" : "text-[#6E6B66] dark:text-[#8A8680]"
                            }`}
                          />
                          <span className="truncate">{item.label}</span>
                        </div>
                        {item.href.includes("/comms") && unreadCommsCount > 0 && (
                          <span
                            className={`min-w-[18px] h-4 px-1.5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 relative z-10 ${
                              isActive ? "bg-white text-[#8E4128]" : "bg-[#F95721] text-white"
                            }`}
                          >
                            {unreadCommsCount > 99 ? "99+" : unreadCommsCount}
                          </span>
                        )}
                      </Link>
                    );
                  })}
              </nav>
            </div>

            {/* Bottom Controls */}
            <div className="pt-4 border-t border-[#ECE8E1]/80 dark:border-white/10 space-y-2 relative z-10">
              <div className="flex items-center justify-between px-1">
                <ThemeToggle />
                <NotificationBell dropdownAlign="down" />
                <button
                  onClick={handleLogout}
                  title="Sign out"
                  className="p-2 rounded-xl text-[#6E6B66] dark:text-[#8A8680] hover:text-rose-500 hover:bg-black/5 dark:hover:bg-white/5 transition-all"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* ======================================================== */}
      {/* MOBILE PROFILE BOTTOM SHEET                              */}
      {/* ======================================================== */}
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

              {/* Push Notifications Row */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-black/[0.03] dark:bg-white/[0.04]">
                <div className="flex items-center gap-2.5">
                  <Bell className="w-4 h-4 text-[#F95721]" />
                  <div>
                    <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 block">
                      Push Notifications
                    </span>
                    <span className="text-[10px] text-zinc-400">
                      Mobile & desktop background alerts
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowProfileSheet(false);
                    openPushNotificationSettings();
                  }}
                  className="px-3 py-1.5 rounded-xl bg-[#7F3922]/15 hover:bg-[#7F3922]/25 text-[#F95721] text-xs font-semibold transition active:scale-95"
                >
                  Manage
                </button>
              </div>

              {isManagerOrAdmin && (
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

      {/* ======================================================== */}
      {/* MOBILE BOTTOM NAVIGATION BAR (< lg, 4 Shortcuts)        */}
      {/* ======================================================== */}
      {!isDashboardPage && (
        <nav
          aria-label="Mobile Navigation"
          className="fixed bottom-0 inset-x-0 lg:hidden z-40 bg-white/90 dark:bg-[#111213]/95 backdrop-blur-2xl border-t border-black/[0.08] dark:border-white/[0.12] shadow-[0_-10px_25px_rgba(0,0,0,0.2)] pb-[env(safe-area-inset-bottom)] px-1 py-1.5 transition-all"
        >
          <div className="grid grid-cols-4 max-w-lg mx-auto w-full">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = item.isActive;

              if (item.isAction) {
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setShowProfileSheet(true)}
                    className={`flex flex-col items-center justify-center py-1 px-0.5 rounded-2xl transition active:scale-95 ${
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
                    <span className="text-[10px] tracking-tight leading-none mt-0.5 whitespace-nowrap">
                      {item.label}
                    </span>
                  </button>
                );
              }

              return (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={() => {
                    if (item.id === "comms" && typeof window !== "undefined") {
                      window.dispatchEvent(new CustomEvent("reset-comms-view"));
                    }
                  }}
                  className={`flex flex-col items-center justify-center py-1 px-0.5 rounded-2xl transition active:scale-95 ${
                    isActive
                      ? "text-[#F95721] font-semibold"
                      : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
                  }`}
                >
                  <div
                    className={`p-1.5 rounded-xl transition relative ${
                      isActive
                        ? "bg-[#7F3922]/15 text-[#F95721]"
                        : "bg-transparent text-current"
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    {typeof item.badge === "number" && item.badge > 0 && (
                      <span className="absolute -top-0.5 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center shadow-xs">
                        {item.badge > 99 ? "99+" : item.badge}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] tracking-tight leading-none mt-0.5 whitespace-nowrap">
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </>
  );
}
