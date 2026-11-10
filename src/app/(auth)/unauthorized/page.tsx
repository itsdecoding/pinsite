"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldX, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { QuantAuthBackground } from "@/components/auth/QuantAuthBackground";

export default function UnauthorizedPage() {
  const [targetPath, setTargetPath] = useState("/studio/queue");
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

      if (userRole === "caller") setTargetPath("/studio/queue");
      else if (userRole === "developer") setTargetPath("/studio/projects");
      else setTargetPath("/studio/dashboard");
    }

    determineRole();
  }, []);

  return (
    <QuantAuthBackground>
      <div className="quant-login-card text-center">
        <div className="w-14 h-14 rounded-full bg-red-500/20 border border-red-500/40 flex items-center justify-center mx-auto mb-4 text-red-300">
          <ShieldX className="w-7 h-7" />
        </div>

        <h2>Access Denied</h2>
        <p className="quant-subtitle">
          Your active role (<span className="font-mono text-emerald-300 font-bold">{role}</span>) does not have authorization to access this area.
        </p>

        <div className="quant-input-box mb-4">
          <Link href={targetPath} className="text-decoration-none">
            <button type="button" className="quant-btn">
              <span>Return to Workspace</span>
              <ArrowRight className="w-4 h-4 ml-1" />
            </button>
          </Link>
        </div>

        <div className="quant-group justify-center">
          <Link href="/studio/login" id="switchAccountLink">
            Switch Account
          </Link>
        </div>
      </div>
    </QuantAuthBackground>
  );
}
