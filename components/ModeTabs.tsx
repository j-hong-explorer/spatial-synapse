"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const MODES = [
  { href: "/",     label: "Brain" },
  { href: "/roll", label: "Dice"  },
  { href: "/list", label: "List"  },
] as const;

export function ModeTabs() {
  const path = usePathname();
  return (
    <nav
      className={
        // Mobile: full-width row, 3 equal segments.
        // Desktop: centered, larger text (2× previous) — main navigation tone.
        "flex w-full md:w-auto items-center " +
        "justify-between md:justify-center gap-0 md:gap-12 " +
        "uppercase tracking-[0.22em] md:tracking-[0.32em] tabular pointer-events-auto"
      }
    >
      {MODES.map((m) => {
        const active = path === m.href;
        return (
          <Link
            key={m.href}
            href={m.href}
            aria-current={active ? "page" : undefined}
            className={
              "flex-1 md:flex-none text-center " +
              "text-[13px] md:text-[26px] " +
              "py-1 md:py-0 " +
              "transition-colors " +
              (active
                ? "text-accent font-medium md:font-light"
                : "text-muted/50 hover:text-accent/80")
            }
          >
            {m.label}
          </Link>
        );
      })}
    </nav>
  );
}
