"use client";

import { useEffect, useState } from "react";

const SESSION_KEY = "ss-visited";

// Tiny pill that shows the lifetime visit count.
// Bumps the counter once per browser session (sessionStorage prevents reload-spam).
// If Upstash isn't configured, the API returns 0 and we render nothing.
export function VisitCounter() {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    // Increment once per session
    try {
      if (!sessionStorage.getItem(SESSION_KEY)) {
        const ok =
          typeof navigator !== "undefined" &&
          typeof navigator.sendBeacon === "function" &&
          navigator.sendBeacon("/api/visits");
        if (!ok) {
          fetch("/api/visits", { method: "POST", keepalive: true }).catch(() => {});
        }
        sessionStorage.setItem(SESSION_KEY, "1");
      }
    } catch {
      /* sessionStorage might be blocked — ignore */
    }
    // Fetch current count
    fetch("/api/visits")
      .then((r) => r.json())
      .then((d) => {
        if (typeof d?.visits === "number") setCount(d.visits);
      })
      .catch(() => {});
  }, []);

  // Render nothing until we have a real number (and not zero, which means
  // backend isn't connected yet).
  if (count === null || count === 0) return null;

  return (
    <span className="text-[10px] text-muted/45 tabular">
      {count.toLocaleString()} visitors
    </span>
  );
}
