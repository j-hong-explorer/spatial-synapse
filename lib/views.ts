// View-count storage backed by Upstash Redis.
// If the env vars aren't set (e.g. local dev without backend), all functions
// no-op and the site still works — counts just stay at 0 and list order is
// the default.

import { Redis } from "@upstash/redis";

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

const redis = url && token ? new Redis({ url, token }) : null;

const KEY = (slug: string) => `views:${slug}`;

export async function getAllViews(): Promise<Record<string, number>> {
  if (!redis) return {};
  try {
    // SCAN for all view keys, then MGET their values.
    const keys: string[] = [];
    let cursor = 0;
    do {
      const [next, batch] = await redis.scan(cursor, { match: "views:*", count: 200 });
      cursor = Number(next);
      keys.push(...batch);
    } while (cursor !== 0);

    if (keys.length === 0) return {};
    const values = (await redis.mget<(number | string | null)[]>(...keys)) ?? [];
    const out: Record<string, number> = {};
    keys.forEach((k, i) => {
      const slug = k.replace(/^views:/, "");
      const v = values[i];
      out[slug] = typeof v === "number" ? v : Number(v) || 0;
    });
    return out;
  } catch (e) {
    console.warn("getAllViews failed:", e);
    return {};
  }
}

export async function incrementView(slug: string): Promise<void> {
  if (!redis) return;
  try {
    await redis.incr(KEY(slug));
  } catch (e) {
    console.warn("incrementView failed:", e);
  }
}

// ---------- Site-wide visit counter ----------

const VISITS_KEY = "visits:total";

export async function getVisits(): Promise<number> {
  if (!redis) return 0;
  try {
    const v = await redis.get<number | string | null>(VISITS_KEY);
    return typeof v === "number" ? v : Number(v) || 0;
  } catch {
    return 0;
  }
}

export async function incrementVisits(): Promise<void> {
  if (!redis) return;
  try {
    await redis.incr(VISITS_KEY);
  } catch (e) {
    console.warn("incrementVisits failed:", e);
  }
}
