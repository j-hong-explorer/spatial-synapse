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
        // Mobile: full-width row, 3 equal segments, larger text so it reads as
        // a primary navigation. Desktop: compact, right-aligned, small.
        "flex w-full md:w-auto items-center " +
        "justify-between md:justify-end gap-0 md:gap-6 " +
        "uppercase tracking-[0.22em] md:tracking-[0.2em] tabular pointer-events-auto"
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
              "flex-1 md:flex-none text-center md:text-right " +
              "text-[13px] md:text-xs " +
              "py-1 md:py-0 " +
              "transition-colors " +
              (active
                ? "text-accent font-medium md:font-normal"
                : "text-muted/60 hover:text-accent/80")
            }
          >
            {m.label}
          </Link>
        );
      })}
    </nav>
  );
}
