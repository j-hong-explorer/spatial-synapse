"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

// Fixed bottom-CENTER chip that returns the user to whichever mode they came
// from. Faint at the top of the page (opacity 0.1) and ramps up to 1.0 as
// the user scrolls toward the bottom, so it never distracts from the cover
// hero but is fully solid once they've read everything.
export function BackLink() {
  const sp = useSearchParams();
  const from = sp.get("from");
  const [opacity, setOpacity] = useState(0.1);

  useEffect(() => {
    const update = () => {
      const scrolled = window.scrollY;
      const total = document.documentElement.scrollHeight - window.innerHeight;
      if (total <= 0) {
        setOpacity(1); // page doesn't scroll → always solid
        return;
      }
      const progress = Math.min(1, Math.max(0, scrolled / total));
      setOpacity(0.1 + progress * 0.9);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

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
      // `replace` instead of push — keeps history clean so a swipe-back from
      // the NEXT detail page lands on Brain/Dice (where you started) instead
      // of bouncing back through previously-viewed detail pages.
      replace
      className="fixed bottom-5 md:bottom-8 left-1/2 -translate-x-1/2 z-50 text-xs uppercase tracking-[0.2em] text-accent hover:text-white px-4 py-2.5 rounded-full border border-white/15 whitespace-nowrap"
      style={{
        opacity,
        transition: "opacity 200ms linear, color 200ms",
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
