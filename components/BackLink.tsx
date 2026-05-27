"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

// Fixed bottom-left chip that returns the user to whichever mode they came from.
// Reads ?from=dice (set by DiceRoller) or defaults to brain.
export function BackLink() {
  const sp = useSearchParams();
  const from = sp.get("from");

  let href = "/";
  let label = "← Back to the brain";
  if (from === "dice") {
    href = "/roll";
    label = "↻ Roll the dice again";
  } else if (from === "list") {
    href = "/list";
    label = "← Back to the list";
  }

  return (
    <Link
      href={href}
      className="fixed bottom-5 left-5 md:bottom-8 md:left-8 z-50 text-xs uppercase tracking-[0.2em] text-accent hover:text-white transition-colors px-4 py-2.5 rounded-full border border-white/15"
      style={{
        background: "rgba(15, 15, 15, 0.55)",
        backdropFilter: "blur(20px) saturate(180%)",
        WebkitBackdropFilter: "blur(20px) saturate(180%)",
        boxShadow: "0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)",
      }}
    >
      {label}
    </Link>
  );
}
