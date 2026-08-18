/**
 * Channel hygiene: a result must only ever appear under the platform it came
 * from, the same page must not appear twice, and one broken channel must not
 * empty the others.
 */
import { searchAllChannels } from "../lib/channels.js";

process.env.YOUTUBE_API_KEY = "test-key";

let pass = 0,
  fail = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(
    (ok ? "  PASS  " : "  FAIL  ") +
      name +
      (ok ? "" : `\n         got  ${JSON.stringify(got)}\n         want ${JSON.stringify(want)}`)
  );
  ok ? pass++ : fail++;
};

/** Routes by URL so each source gets the response shape it expects. */
function stubNetwork({ githubFails = false } = {}) {
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes("youtube/v3/search")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ items: [{ id: { videoId: "abc" } }, { id: { videoId: "def" } }] }),
      };
    }
    if (u.includes("youtube/v3/videos")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            { id: "abc", snippet: { title: "small", publishedAt: "2026-08-01T00:00:00Z" }, statistics: { viewCount: "100" } },
            { id: "def", snippet: { title: "huge", publishedAt: "2026-08-02T00:00:00Z" }, statistics: { viewCount: "999999" } },
          ],
        }),
      };
    }
    if (u.includes("hn.algolia.com")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          hits: [
            { objectID: "1", title: "quiet story", points: 12, num_comments: 3, created_at: "2026-08-01T00:00:00Z", url: "https://a.com/1", author: "alice" },
            { objectID: "2", title: "front page story", points: 940, num_comments: 512, created_at: "2026-08-05T00:00:00Z", url: "https://b.com/2", author: "bob" },
            { objectID: "3", title: "Ask HN: no url", points: 40, num_comments: 9, created_at: "2026-08-06T00:00:00Z", author: "carol" },
          ],
        }),
      };
    }
    if (u.includes("api.github.com")) {
      if (githubFails) return { ok: false, status: 403, json: async () => ({}) };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            { full_name: "a/b", html_url: "https://github.com/a/b", stargazers_count: 5, forks_count: 1, pushed_at: "2026-08-10T00:00:00Z", owner: { login: "a" } },
          ],
        }),
      };
    }
    throw new Error(`unstubbed url: ${u}`);
  };
}

stubNetwork();
const channels = await searchAllChannels("x");
const by = Object.fromEntries(channels.map((c) => [c.id, c]));

check("channels declare their ranking basis", Object.fromEntries(channels.map((c) => [c.id, c.ranked])), {
  hackernews: "date",
  youtube: "date",
  github: "engagement",
});

// Newest first, regardless of how many points a story has.
// Fixture dates: quiet=Aug 1, front page=Aug 5, Ask HN=Aug 6.
check("HN sorts newest first, not by points", by.hackernews.results.map((r) => r.title), [
  "Ask HN: no url",
  "front page story",
  "quiet story",
]);
check("HN still exposes points and comments", by.hackernews.results[1].stats, [
  { label: "points", value: 940 },
  { label: "comments", value: 512 },
]);
// Ask HN posts carry no external link, so they must fall back to the thread.
check(
  "HN story without a url falls back to the thread",
  by.hackernews.results.find((r) => r.title.startsWith("Ask HN")).url,
  "https://news.ycombinator.com/item?id=3"
);

// Fixture dates: small=Aug 1, huge=Aug 2 - so newest first puts "huge" first
// here for date reasons, not view-count reasons.
check("YouTube sorts newest first", by.youtube.results.map((r) => r.title), ["huge", "small"]);
check("YouTube exposes view/like/comment stats", by.youtube.results[0].stats[0].label, "views");
check("GitHub exposes star counts", by.github.results[0].stats[0], { label: "stars", value: 5 });

// A failing channel must not take down the others.
stubNetwork({ githubFails: true });
const degraded = await searchAllChannels("x");
const gh = degraded.find((c) => c.id === "github");
check("failed channel reports an error", Boolean(gh.error), true);
check("failed channel does not empty the others", degraded.find((c) => c.id === "hackernews").results.length, 3);

// YouTube without a key is "not set up", which is not the same as "no results".
delete process.env.YOUTUBE_API_KEY;
stubNetwork();
const noKey = await searchAllChannels("x");
check("YouTube without a key reports unconfigured", noKey.find((c) => c.id === "youtube").unconfigured, true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
