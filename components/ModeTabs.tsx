"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const MODES = [
  { href: "/",     label: "Brain" },
  { href: "/roll", label: "Dice"  },
  { href: "/list", label: "List"  },
] as const;

// Optional `onCurrentClick`: fires when the user taps the tab for the page
// they're already on. Used by Brain to reset selection + camera (so tapping
// "Brain" while a node is selected behaves like a home reset).
export function ModeTabs({ onCurrentClick }: { onCurrentClick?: () => void } = {}) {
  const path = usePathname();
  return (
    <nav
      className={
        // Mobile: full-width row, 3 equal segments.
        // Desktop: centered, ~70% of the previous large size — comfortable
        // primary nav without dominating the layout.
        "flex w-full md:w-auto items-center " +
        "justify-between md:justify-center gap-0 md:gap-9 " +
        "uppercase tracking-[0.22em] md:tracking-[0.3em] tabular pointer-events-auto"
      }
    >
      {MODES.map((m) => {
        const active = path === m.href;
        return (
          <Link
            key={m.href}
            href={m.href}
            aria-current={active ? "page" : undefined}
            onClick={(e) => {
              if (active && onCurrentClick) {
                e.preventDefault();
                onCurrentClick();
              }
            }}
            className={
              "flex-1 md:flex-none text-center " +
              "text-[13px] md:text-[18px] " +
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
