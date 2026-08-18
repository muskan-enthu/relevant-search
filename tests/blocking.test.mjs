/**
 * A failing source must never look like "no results found".
 *
 * This is the bug class that bit hardest during development: a network error or
 * a rejected key returned an empty array, the UI rendered "nothing found", and
 * nothing anywhere said the search had actually failed.
 */
import { searchAllChannels } from "../lib/channels.js";

let pass = 0,
  fail = 0;
const check = (name, got, want) => {
  const ok = got === want;
  console.log((ok ? "  PASS  " : "  FAIL  ") + name + (ok ? "" : `  (got ${got}, want ${want})`));
  ok ? pass++ : fail++;
};

const OK_HN = {
  hits: [{ objectID: "1", title: "t", points: 5, num_comments: 1, created_at: "2026-08-01T00:00:00Z", url: "https://a.com" }],
};

/** Everything healthy except the one source under test. */
function stub({ failHost, status, throwNetwork = false } = {}) {
  globalThis.fetch = async (url) => {
    const u = String(url);
    const isTarget = failHost && u.includes(failHost);

    if (isTarget && throwNetwork) throw new TypeError("fetch failed");
    if (isTarget) return { ok: false, status, json: async () => ({}), text: async () => "quota" };

    if (u.includes("hn.algolia.com")) return { ok: true, status: 200, json: async () => OK_HN };
    if (u.includes("api.github.com")) return { ok: true, status: 200, json: async () => ({ items: [] }) };
    if (u.includes("youtube/v3/search")) return { ok: true, status: 200, json: async () => ({ items: [] }) };
    return { ok: true, status: 200, json: async () => ({}) };
  };
}

process.env.YOUTUBE_API_KEY = "test-key";

/** Returns "error" | "unconfigured" | "empty" | "results" for one channel. */
async function outcome(channelId) {
  const channels = await searchAllChannels("anything");
  const c = channels.find((x) => x.id === channelId);
  if (c.error) return "error";
  if (c.unconfigured) return "unconfigured";
  return c.results.length ? "results" : "empty";
}

stub({ failHost: "hn.algolia.com", status: 429 });
check("HN rate limited -> error, NOT empty", await outcome("hackernews"), "error");

stub({ failHost: "hn.algolia.com", throwNetwork: true });
check("HN network failure -> error, NOT empty", await outcome("hackernews"), "error");

stub({ failHost: "api.github.com", status: 403 });
check("GitHub rate limited -> error, NOT empty", await outcome("github"), "error");

stub({ failHost: "api.github.com", throwNetwork: true });
check("GitHub network failure -> error, NOT empty", await outcome("github"), "error");

stub({ failHost: "googleapis.com", status: 403 });
check("YouTube quota exhausted -> error, NOT empty", await outcome("youtube"), "error");

// A source that answers normally with nothing to say is genuinely empty, and
// must not be reported as broken.
stub();
check("GitHub with no matches -> empty, NOT an error", await outcome("github"), "empty");
check("HN with matches -> results", await outcome("hackernews"), "results");

// Missing credentials are "not set up", which is neither empty nor broken.
delete process.env.YOUTUBE_API_KEY;
stub();
check("YouTube without a key -> unconfigured", await outcome("youtube"), "unconfigured");

// One source failing must not affect the others.
process.env.YOUTUBE_API_KEY = "test-key";
stub({ failHost: "api.github.com", status: 403 });
check("a failing source leaves the others working", await outcome("hackernews"), "results");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
