import { search } from "./providers.js";

/**
 * The four source channels.
 *
 * Twitter/X, Instagram and LinkedIn have no free read APIs, so we reach their
 * public content through Tavily's index instead, scoped by domain. Same results
 * a user would get searching the platform on Google - no scraping, no ToS
 * problem.
 */
export const CHANNELS = [
  { id: "web", label: "Web", domains: [] },
  { id: "twitter", label: "Twitter / X", domains: ["x.com", "twitter.com"] },
  { id: "instagram", label: "Instagram", domains: ["instagram.com"] },
  { id: "linkedin", label: "LinkedIn", domains: ["linkedin.com"] },
];

/**
 * Hit all four channels at once. One slow or dead channel must not hold up
 * the others, so each gets its own timeout and failures resolve to empty.
 */
export async function searchAllChannels(query, { perChannel = 8, range = "" } = {}) {
  const jobs = CHANNELS.map(async (ch) => {
    const results = await withTimeout(
      search(query, { domains: ch.domains, count: perChannel, range }),
      12000
    );
    return { ...ch, results: polish(dedupe(onlyFrom(results, ch.domains)), ch.id) };
  });

  return Promise.all(jobs);
}

/**
 * Belt and braces: Tavily's include_domains is reliable, but a stray
 * off-platform result would silently mislabel a channel, so verify the host
 * here rather than trusting the upstream filter.
 */
function onlyFrom(results, domains) {
  if (domains.length === 0) return results;
  return results.filter((r) => {
    try {
      const host = new URL(r.url).host.replace(/^www\./, "").toLowerCase();
      return domains.some((d) => host === d || host.endsWith(`.${d}`));
    } catch {
      return false;
    }
  });
}

/**
 * LinkedIn serves /in/ profile URLs behind an authwall (HTTP 999) that renders
 * in the visitor's regional language, so those links dead-end in a language the
 * user did not ask for. Posts, articles and learning pages open normally.
 *
 * Rather than hide them, flag them and sort them below real content, and pin
 * the locale so anything LinkedIn does render comes back in English.
 */
function polish(results, channelId) {
  if (channelId !== "linkedin") return results;

  const annotated = results.map((r) => {
    const authwalled = /linkedin\.com\/in\//.test(r.url);
    return { ...r, authwalled, url: withEnglishLocale(r.url) };
  });

  // Stable partition: readable content first, authwalled profiles last.
  return [...annotated.filter((r) => !r.authwalled), ...annotated.filter((r) => r.authwalled)];
}

function withEnglishLocale(url) {
  try {
    const u = new URL(url);
    if (!u.searchParams.has("locale")) u.searchParams.set("locale", "en_US");
    return u.toString();
  } catch {
    return url;
  }
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

function normaliseUrl(url) {
  try {
    const u = new URL(url);
    // Tracking params make identical pages look distinct.
    u.search = "";
    u.hash = "";
    return u.host.replace(/^www\./, "") + u.pathname.replace(/\/$/, "");
  } catch {
    return url;
  }
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve([]), ms)),
  ]);
}
