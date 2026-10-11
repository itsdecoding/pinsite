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
} from "lucide-react";
import { useUserSession } from "@/contexts/UserSessionContext";
import { createClient } from "@/lib/supabase/client";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

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
      {/* MANAGER / ADMIN SIDE NAVIGATION DRAWER (Opens via ☰)     */}
      {/* ======================================================== */}
      {isManagerOrAdmin && isDrawerOpen && (
        <div
          role="dialog"
          aria-label="Navigation Drawer"
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm lg:hidden flex animate-in fade-in duration-200"
          onClick={() => setIsDrawerOpen(false)}
        >
          <div
            className="w-72 max-w-[85vw] h-full bg-white dark:bg-[#141516] border-r border-black/[0.1] dark:border-white/[0.12] p-5 shadow-2xl flex flex-col justify-between animate-in slide-in-from-left duration-250"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Top: User Profile Header + Close button */}
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-4 border-b border-black/[0.08] dark:border-white/[0.08]">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-[#7F3922]/20 border border-[#7F3922]/40 text-[#F95721] font-bold text-sm flex items-center justify-center shrink-0">
                    {(profile?.full_name || user?.email || "U").charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-[#111110] dark:text-[#F5F3EF] truncate">
                      {profile?.full_name || "Muzammil"}
                    </h3>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 capitalize">
                      Agency OS • <span className="font-semibold text-[#F95721]">{role}</span>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsDrawerOpen(false)}
                  className="p-1.5 rounded-full text-zinc-400 hover:text-zinc-200 hover:bg-black/5 dark:hover:bg-white/10 shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Drawer Links: All 6 primary items */}
              <div className="space-y-1">
                <span className="text-[10px] font-mono tracking-widest uppercase text-zinc-400 dark:text-zinc-500 font-bold px-3 block pb-1">
                  NAVIGATION
                </span>
                {drawerItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = item.isActive;
                  return (
                    <Link
                      key={item.id}
                      href={item.href}
                      onClick={() => {
                        setIsDrawerOpen(false);
                        if (item.id === "comms" && typeof window !== "undefined") {
                          window.dispatchEvent(new CustomEvent("reset-comms-view"));
                        }
                      }}
                      className={`flex items-center justify-between px-3.5 py-2.5 transition active:scale-[0.98] ${
                        isActive
                          ? "bg-[#F95721]/15 text-[#F95721] font-bold border-l-3 border-[#F95721] rounded-r-2xl rounded-l-xs shadow-xs"
                          : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-black/5 dark:hover:bg-white/5 rounded-2xl font-medium"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-[#F95721]" : "text-zinc-400 dark:text-zinc-500"}`} />
                        <span className="text-xs truncate">{item.label}</span>
                      </div>
                      {typeof item.badge === "number" && item.badge > 0 && (
                        <span className="min-w-[18px] h-4 px-1.5 rounded-full bg-[#F95721] text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                          {item.badge > 99 ? "99+" : item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* Drawer Bottom: Theme, Notifications, Sign Out */}
            <div className="pt-4 border-t border-black/[0.08] dark:border-white/[0.08] space-y-2">
              <div className="flex items-center justify-between p-2.5 rounded-2xl bg-black/[0.03] dark:bg-white/[0.04]">
                <span className="text-xs text-zinc-600 dark:text-zinc-300 font-medium">
                  Theme Appearance
                </span>
                <ThemeToggle />
              </div>

              <Link
                href="/studio/comms"
                onClick={() => setIsDrawerOpen(false)}
                className="flex items-center justify-between p-2.5 rounded-2xl bg-black/[0.03] dark:bg-white/[0.04] text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/10 transition"
              >
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-[#F95721]" />
                  <span>Notifications</span>
                </div>
                {unreadCommsCount > 0 && (
                  <span className="min-w-[18px] h-4 px-1.5 rounded-full bg-[#F95721] text-white text-[10px] font-bold flex items-center justify-center">
                    {unreadCommsCount}
                  </span>
                )}
              </Link>

              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 p-2.5 rounded-2xl bg-rose-500/10 text-rose-500 dark:text-rose-400 font-semibold text-xs hover:bg-rose-500/20 transition active:scale-98"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
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
    </>
  );
}
