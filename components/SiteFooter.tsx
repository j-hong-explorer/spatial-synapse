"use client";

import { useState } from "react";
import { VisitCounter } from "./VisitCounter";

const EMAIL = "jeahong0754@gmail.com";
const INSTAGRAM = "https://www.instagram.com/j._.hong_/";

// Bottom-of-the-screen footer for the Brain page.
// Holds: navigation hint, email (copy-to-clipboard), Instagram link, visit count.
// When `dimmed` is true (a node is selected) the hint/email/instagram row is
// hidden but the visit counter STAYS visible.
export function SiteFooter({ hint, dimmed = false }: { hint: string; dimmed?: boolean }) {
  const [copied, setCopied] = useState(false);

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(EMAIL);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be unavailable on http */
    }
  };

  return (
    <footer className="absolute bottom-0 left-0 right-0 z-20 px-5 pb-3 md:pb-5 flex flex-col items-center gap-2 pointer-events-none">
      {/* Hint + email + IG — only on the initial Brain view */}
      <div
        className="flex flex-col items-center gap-2 transition-opacity duration-300"
        style={{ opacity: dimmed ? 0 : 1, pointerEvents: dimmed ? "none" : "auto" }}
      >
        <div className="text-[9px] md:text-xs uppercase tracking-[0.25em] md:tracking-[0.3em] text-muted/70 tabular">
          {hint}
        </div>

        <div className="flex items-center gap-3 md:gap-4">
          {/* Email — click anywhere on the chip to copy */}
          <button
            type="button"
            onClick={copyEmail}
            className="group flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] hover:border-white/20 transition-colors"
            aria-label="Copy email address"
          >
            {/* Mail icon */}
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="text-accent/70 group-hover:text-accent">
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="m3 7 9 6 9-6" />
            </svg>
            <span className="text-[10px] md:text-[11px] text-accent/80 group-hover:text-accent tabular">
              {copied ? "Copied!" : EMAIL}
            </span>
          </button>

          {/* Instagram */}
          <a
            href={INSTAGRAM}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center justify-center w-7 h-7 rounded-full border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] hover:border-white/20 transition-colors"
            aria-label="Instagram"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="text-accent/70 group-hover:text-accent">
              <rect x="3" y="3" width="18" height="18" rx="5" />
              <circle cx="12" cy="12" r="4" />
              <circle cx="17.5" cy="6.5" r="0.7" fill="currentColor" />
            </svg>
          </a>
        </div>
      </div>

      {/* Visit counter — ALWAYS visible, even when a node is selected */}
      <VisitCounter />
    </footer>
  );
}
