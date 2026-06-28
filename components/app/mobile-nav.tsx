"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, LayoutDashboard, LogOut, PieChart } from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut } from "@/app/(auth)/actions";
import { Logo } from "@/components/app/logo";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/companies", label: "Companies", icon: Building2 },
  { href: "/fund", label: "Fund", icon: PieChart },
];

/** Sticky top bar for mobile — brand + sign out. Hidden on desktop. */
export function MobileTopBar() {
  return (
    <header className="pt-safe sticky top-0 z-30 border-b border-border bg-card/90 backdrop-blur md:hidden">
      <div className="flex h-14 items-center justify-between px-4">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Logo className="h-6 w-6 shrink-0" />
          <span className="text-sm font-semibold">Automation Investment</span>
        </Link>
        <form action={signOut}>
          <button
            type="submit"
            aria-label="Sign out"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground active:bg-accent"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </form>
      </div>
    </header>
  );
}

/** Fixed bottom tab bar for mobile — iOS-style top-level navigation. */
export function MobileTabBar() {
  const pathname = usePathname();
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur md:hidden">
      <div className="flex items-stretch">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors active:bg-accent",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className="h-5 w-5" />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
