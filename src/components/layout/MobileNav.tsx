"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Phone, FolderKanban, MessageSquare, User } from "lucide-react";

export function MobileNav() {
  const pathname = usePathname();

  const navItems = [
    { label: "Queue", href: "/queue", icon: Phone },
    { label: "Projects", href: "/projects", icon: FolderKanban },
    { label: "DMs", href: "/comms", icon: MessageSquare },
    { label: "Me", href: "/dashboard", icon: User },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-[100] h-16 bg-background-surface/95 backdrop-blur border-t border-border-subtle flex items-center justify-around px-2">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = pathname.startsWith(item.href);

        return (
          <Link
            key={item.label}
            href={item.href}
            className={`flex flex-col items-center justify-center gap-1 w-16 py-1.5 rounded-lg transition-colors ${
              isActive
                ? "text-accent-primary"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            <Icon className="w-5 h-5" strokeWidth={isActive ? 2.2 : 1.75} />
            <span className="text-[11px] font-medium tracking-tight">
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
