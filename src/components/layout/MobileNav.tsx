"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Phone, FolderKanban, MessageSquare, User } from "lucide-react";

export function MobileNav() {
  const pathname = usePathname();
  const isStudio = pathname.startsWith("/studio");
  const prefix = isStudio ? "/studio" : "";

  const navItems = [
    { label: "Queue", href: `${prefix}/queue`, rawPath: "/queue", icon: Phone },
    { label: "Projects", href: `${prefix}/projects`, rawPath: "/projects", icon: FolderKanban },
    { label: "Comms", href: `${prefix}/comms`, rawPath: "/comms", icon: MessageSquare },
    { label: "Dashboard", href: `${prefix}/dashboard`, rawPath: "/dashboard", icon: User },
  ];

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 h-16 bg-white/95 dark:bg-[#1C1A17]/95 backdrop-blur-md border-t border-[#ECE8E1] dark:border-[#2D2924] flex items-center justify-around px-2 shadow-lg">
      {navItems.map((item) => {
        const Icon = item.icon;
        const normalizedPath = pathname.replace(/^\/studio/, "");
        const isActive =
          normalizedPath === item.rawPath ||
          normalizedPath.startsWith(item.rawPath + "/");

        return (
          <Link
            key={item.label}
            href={item.href}
            className={`flex flex-col items-center justify-center gap-1 w-16 py-1.5 rounded-xl transition-colors ${
              isActive
                ? "text-[#F95721]"
                : "text-[#6E6B66] dark:text-[#8A8680] hover:text-[#111110] dark:hover:text-[#F5F3EF]"
            }`}
          >
            <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 1.75} />
            <span className="text-[11px] font-medium tracking-tight">
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
