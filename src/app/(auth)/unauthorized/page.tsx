"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldX, ArrowRight, Home } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function UnauthorizedPage() {
  const [targetPath, setTargetPath] = useState("/queue");
  const [role, setRole] = useState<string>("caller");
  const supabase = createClient();

  useEffect(() => {
    async function determineRole() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      const userRole = profile?.role || "caller";
      setRole(userRole);

      if (userRole === "caller") setTargetPath("/queue");
      else if (userRole === "developer") setTargetPath("/projects");
      else setTargetPath("/dashboard");
    }

    determineRole();
  }, []);

  return (
    <div className="min-h-screen bg-background-base flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-background-card border border-border-subtle rounded-xl p-8 shadow-card text-center">
        <div className="w-12 h-12 rounded-full bg-feedback-error/10 border border-feedback-error/20 flex items-center justify-center mx-auto mb-4 text-feedback-error">
          <ShieldX className="w-6 h-6" />
        </div>

        <h1 className="text-lg font-bold text-text-primary">403 — Unauthorized View</h1>
        <p className="text-xs text-text-secondary mt-2 mb-6">
          Your active role (<span className="font-mono text-accent-primary">{role}</span>) does not have authorization to access this segment.
        </p>

        <div className="space-y-3">
          <Link
            href={targetPath}
            className="w-full py-2.5 px-4 bg-accent-primary hover:bg-accent-hover text-background-base font-semibold text-xs uppercase tracking-wider rounded-md flex items-center justify-center gap-2 transition-colors"
          >
            <span>Return to Assigned Workspace</span>
            <ArrowRight className="w-4 h-4" />
          </Link>

          <Link
            href="/login"
            className="w-full py-2 px-4 bg-background-surface hover:bg-background-elevated text-text-secondary text-xs rounded-md flex items-center justify-center gap-2 border border-border-subtle transition-colors"
          >
            Switch Account
          </Link>
        </div>
      </div>
    </div>
  );
}
