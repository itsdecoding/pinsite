"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Phone, FolderKanban, MessageSquare, LayoutDashboard, UserCheck, UploadCloud, LogOut, Mail } from "lucide-react";
import { NotificationBell } from "@/components/comms/NotificationBell";
import { createClient } from "@/lib/supabase/client";

export function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [profile, setProfile] = useState<{ full_name: string; role: string } | null>(null);
  const supabase = createClient();

  useEffect(() => {
    async function loadUser() {
      // Check for demo mode cookie
      const match = document.cookie.match(new RegExp("(^| )agency_demo_role=([^;]+)"));
      const demoRole = match ? match[2] : null;
      if (demoRole) {
        setProfile({
          full_name:
            demoRole === "manager"
              ? "Muzammil (Owner)"
              : demoRole === "caller"
              ? "Lead Caller (Operator)"
              : "Lead Dev (Full-Stack)",
          role: demoRole,
        });
        return;
      }

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

        if (data) {
          setProfile(data);
        }
      } catch (err) {
        // Supabase placeholder error fallback
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

  const role = profile?.role || "caller";

  return (
    <header className="sticky top-0 z-[100] h-14 bg-background-base/90 backdrop-blur border-b border-border-subtle px-4 lg:px-6 flex items-center justify-between">
      <div className="flex items-center gap-6">
        <Link href="/" className="flex items-center gap-2 text-text-primary font-bold tracking-tight">
          <span className="w-2.5 h-2.5 rounded-full bg-accent-primary animate-pulse" />
          <span className="text-base tracking-wider uppercase font-mono">Agency OS</span>
        </Link>

        {/* Desktop Nav Links */}
        <nav className="hidden md:flex items-center gap-1 text-sm font-medium">
          {(role === "caller" || role === "manager" || role === "admin") && (
            <Link
              href="/queue"
              className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-2 ${
                pathname.startsWith("/queue")
                  ? "bg-background-elevated text-accent-primary"
                  : "text-text-secondary hover:text-text-primary hover:bg-background-surface"
              }`}
            >
              <Phone className="w-4 h-4" />
              <span>Queue</span>
            </Link>
          )}

          {(role === "developer" || role === "manager" || role === "admin") && (
            <Link
              href="/projects"
              className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-2 ${
                pathname.startsWith("/projects")
                  ? "bg-background-elevated text-accent-primary"
                  : "text-text-secondary hover:text-text-primary hover:bg-background-surface"
              }`}
            >
              <FolderKanban className="w-4 h-4" />
              <span>Projects</span>
            </Link>
          )}

          <Link
            href="/comms"
            className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-2 ${
              pathname.startsWith("/comms")
                ? "bg-background-elevated text-accent-primary"
                : "text-text-secondary hover:text-text-primary hover:bg-background-surface"
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>Comms</span>
          </Link>

          {(role === "manager" || role === "admin") && (
            <>
              <Link
                href="/dashboard"
                className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-2 ${
                  pathname.startsWith("/dashboard")
                    ? "bg-background-elevated text-accent-primary"
                    : "text-text-secondary hover:text-text-primary hover:bg-background-surface"
                }`}
              >
                <LayoutDashboard className="w-4 h-4" />
                <span>Ops Dashboard</span>
              </Link>

              <Link
                href="/manager/ingestion"
                className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-2 ${
                  pathname.startsWith("/manager/ingestion")
                    ? "bg-background-elevated text-accent-primary"
                    : "text-text-secondary hover:text-text-primary hover:bg-background-surface"
                }`}
              >
                <UploadCloud className="w-4 h-4" />
                <span>CSV Upload</span>
              </Link>

              <Link
                href="/manager/invites"
                className={`px-3 py-1.5 rounded-md transition-colors flex items-center gap-2 ${
                  pathname.startsWith("/manager/invites")
                    ? "bg-background-elevated text-accent-primary"
                    : "text-text-secondary hover:text-text-primary hover:bg-background-surface"
                }`}
              >
                <Mail className="w-4 h-4" />
                <span>Invites</span>
              </Link>
            </>
          )}
        </nav>
      </div>

      <div className="flex items-center gap-3">
        <NotificationBell />

        <div className="h-4 w-[1px] bg-border-subtle" />

        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full bg-accent-subtle border border-accent-border flex items-center justify-center text-xs font-semibold text-accent-primary">
            {profile?.full_name ? profile.full_name[0].toUpperCase() : "U"}
          </div>
          <div className="hidden sm:block text-left">
            <p className="text-xs font-medium text-text-primary leading-none truncate max-w-[120px]">
              {profile?.full_name || "User"}
            </p>
            <span className="text-[10px] uppercase font-mono text-text-muted">
              {role}
            </span>
          </div>

          <button
            onClick={handleLogout}
            title="Log out"
            className="p-1.5 rounded-md text-text-secondary hover:text-feedback-error hover:bg-feedback-error/10 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
