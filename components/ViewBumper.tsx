"use client";

import { useEffect } from "react";

// Mounted on each concept detail page. Bumps the per-slug view counter once
// per mount. Silent — failures don't surface to the user, and the rest of the
// page is unaffected if the backend isn't configured.
export function ViewBumper({ slug }: { slug: string }) {
  useEffect(() => {
    if (!slug) return;
    // sendBeacon is best-effort and fires even if the user navigates away
    // immediately, which is what we want for a single-page-app counter.
    try {
      const payload = JSON.stringify({ slug });
      const ok =
        typeof navigator !== "undefined" &&
        typeof navigator.sendBeacon === "function" &&
        navigator.sendBeacon(
          "/api/views",
          new Blob([payload], { type: "application/json" })
        );
      if (!ok) {
        fetch("/api/views", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
          keepalive: true,
        }).catch(() => {});
      }
    } catch {
      /* ignore */
    }
  }, [slug]);
  return null;
}
