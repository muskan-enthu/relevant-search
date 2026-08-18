import { searchYouTube, isConfigured as youtubeReady } from "./sources/youtube.js";
import { searchGitHub } from "./sources/github.js";
import { searchHackerNews } from "./sources/hackernews.js";

/**
 * The four source channels.
 *
 * Every channel here has a free API that returns real engagement and a real
 * date, so every channel is ranked by recency-weighted engagement rather than
 * by someone else's relevance score.
 *
 * Dropped along the way: X (only major platform that paywalls engagement data,
 * ~$200/month), Instagram and LinkedIn (no free API at all), and the open web
 * (no engagement or date to rank on).
 */
export const CHANNELS = [
  {
    id: "hackernews",
    label: "Hacker News",
    ranked: "date",
    fetch: (q, o) => searchHackerNews(q, o),
  },
  {
    id: "youtube",
    label: "YouTube",
    ranked: "date",
    fetch: (q, o) => searchYouTube(q, o),
  },
  {
    id: "github",
    label: "GitHub",
    ranked: "engagement",
    fetch: (q, o) => searchGitHub(q, o),
  },
];

/**
 * Hit all channels at once.
 *
 * One channel failing must not empty the others, so each failure is captured
 * on that channel as an `error` string rather than thrown. A channel that is
 * merely unconfigured (YouTube without a key) reports that separately, so the
 * UI can tell "not set up" apart from "broken".
 */
export async function searchAllChannels(query, { perChannel = 8 } = {}) {
  const jobs = CHANNELS.map(async (ch) => {
    const base = { id: ch.id, label: ch.label, ranked: ch.ranked };
    try {
      const out = await withTimeout(ch.fetch(query, { count: perChannel }), 14000);
      if (out.unconfigured) {
        return { ...base, results: [], unconfigured: true };
      }
      return {
        ...base,
        results: rank(dedupe(onlyFrom(out.results || [], ch.id)), ch.ranked),
      };
    } catch (err) {
      console.error(`[${ch.id}] "${query}" failed:`, err.message);
      return { ...base, results: [], error: err.message };
    }
  });

  return Promise.all(jobs);
}

/* ------------------------------------------------------------------ */

// Each source now returns only its own content, so no host check is needed.
const CHANNEL_DOMAINS = {};

/**
 * Each channel sorts by whatever its data actually supports.
 *
 * "date"       - newest first. Undated items sort last: an unknown date is not
 *                evidence of freshness.
 * "engagement" - biggest first. Used for GitHub, where every active repo was
 *                pushed today, so a date sort would order results arbitrarily.
 */
function rank(results, mode) {
  if (mode === "engagement") {
    return [...results].sort(
      (a, b) => (Number(b.engagement) || 0) - (Number(a.engagement) || 0)
    );
  }
  return [...results].sort((a, b) => {
    const at = a.date ? new Date(a.date).getTime() : -Infinity;
    const bt = b.date ? new Date(b.date).getTime() : -Infinity;
    return bt - at;
  });
}

/**
 * Tavily's include_domains is reliable, but a stray off-platform result would
 * silently mislabel a channel, so verify the host here rather than trusting the
 * upstream filter. YouTube and GitHub come from their own APIs and need no check.
 */
function onlyFrom(results, channelId) {
  const domains = CHANNEL_DOMAINS[channelId];
  if (!domains) return results;
  return results.filter((r) => {
    try {
      const host = new URL(r.url).host.replace(/^www\./, "").toLowerCase();
      return domains.some((d) => host === d || host.endsWith(`.${d}`));
    } catch {
      return false;
    }
  });
}

function dedupe(results) {
  const seen = new Set();
  return results.filter((r) => {
    const key = normaliseUrl(r.url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Tracking params make identical pages look distinct, but some query params
 * ARE the identity - youtube.com/watch?v=ID is the clearest case, and dropping
 * the whole query string collapsed every video into one result.
 * So strip only params known to be noise.
 */
const TRACKING_PARAMS = new Set([
  "fbclid",
  "gclid",
  "igshid",
  "mc_cid",
  "mc_eid",
  "ref",
  "ref_src",
  "ref_url",
  "s",
  "si",
  "source",
]);

function normaliseUrl(url) {
  try {
    const u = new URL(url);
    for (const key of [...u.searchParams.keys()]) {
      if (key.startsWith("utm_") || TRACKING_PARAMS.has(key)) {
        u.searchParams.delete(key);
      }
    }
    u.searchParams.sort();
    u.hash = "";
    const query = u.searchParams.toString();
    return (
      u.host.replace(/^www\./, "") +
      u.pathname.replace(/\/$/, "") +
      (query ? `?${query}` : "")
    );
  } catch {
    return url;
  }
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("channel timed out")), ms)
    ),
  ]);
}
