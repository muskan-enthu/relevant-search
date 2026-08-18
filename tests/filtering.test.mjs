/**
 * Channel hygiene: a result must only ever appear under the platform it
 * actually came from, and the same page must not appear twice.
 */
import { searchAllChannels } from "../lib/channels.js";

process.env.TAVILY_API_KEY = "test-key";

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

// Stub the network so this tests OUR filtering, not Tavily's availability.
const FAKE = [
  { title: "real tweet", url: "https://x.com/claudeai", content: "" },
  { title: "www variant", url: "https://www.x.com/anthropicai", content: "" },
  { title: "subdomain", url: "https://mobile.x.com/foo", content: "" },
  { title: "impostor", url: "https://x.com.evil.net/phish", content: "" },
  { title: "off-platform", url: "https://reddit.com/r/x", content: "" },
  { title: "dupe", url: "https://x.com/claudeai?utm=abc", content: "" },
];

globalThis.fetch = async () => ({
  ok: true,
  status: 200,
  json: async () => ({ results: FAKE }),
});

const channels = await searchAllChannels("x");
const x = channels.find((c) => c.id === "twitter").results.map((r) => r.url);
const ig = channels.find((c) => c.id === "instagram").results.map((r) => r.url);
const web = channels.find((c) => c.id === "web").results.length;

check("X channel keeps x.com + www + subdomain only", x, [
  "https://x.com/claudeai",
  "https://www.x.com/anthropicai",
  "https://mobile.x.com/foo",
]);
check("lookalike domain x.com.evil.net rejected", x.includes("https://x.com.evil.net/phish"), false);
check("utm-only duplicate collapsed", x.filter((u) => u.includes("claudeai")).length, 1);
check("Instagram channel rejects all x.com results", ig, []);
// 6 fixtures in, but the two claudeai urls differ only by utm= and dedupe to one.
check("web channel skips domain filter but still dedupes", web, 5);

// LinkedIn gets extra handling: profile URLs are authwalls, so they sort last
// and carry a flag, and every URL is pinned to English.
globalThis.fetch = async () => ({
  ok: true,
  status: 200,
  json: async () => ({
    results: [
      { title: "profile", url: "https://www.linkedin.com/in/someone", content: "" },
      { title: "post", url: "https://www.linkedin.com/posts/abc", content: "" },
    ],
  }),
});

const li = channels.length && (await searchAllChannels("x")).find((c) => c.id === "linkedin").results;
check("LinkedIn content sorts above authwalled profiles", li.map((r) => r.authwalled), [false, true]);
check("LinkedIn urls pinned to en_US", li.every((r) => r.url.includes("locale=en_US")), true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
