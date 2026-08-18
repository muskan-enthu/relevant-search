/**
 * Hacker News via the Algolia search API.
 *
 * No key, no signup, and it returns real engagement - points and comment
 * counts - plus an exact timestamp. That combination is rare enough that HN is
 * the cheapest engagement-ranked source available.
 *
 * Coverage is tech-heavy: excellent for software topics, empty for most else.
 */

const SEARCH_URL = "https://hn.algolia.com/api/v1/search";
const TIMEOUT_MS = 12000;

export function isConfigured() {
  return true; // no credentials of any kind
}

export async function searchHackerNews(query, { count = 8 } = {}) {
  const params = new URLSearchParams({
    query,
    tags: "story",
    hitsPerPage: String(count),
  });


  let res;
  try {
    res = await fetch(`${SEARCH_URL}?${params}`, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new Error(`hacker news unreachable: ${err.message}`);
  }

  if (res.status === 429) throw new Error("Hacker News rate limit reached. Try again shortly.");
  if (!res.ok) throw new Error(`Hacker News HTTP ${res.status}`);

  const data = await res.json();

  const results = (data.hits || [])
    .filter((h) => h.title)
    .map((h) => {
      const points = Number(h.points || 0);
      return {
        title: h.title,
        // Stories without a link ("Ask HN" and friends) live on the HN thread itself.
        url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
        snippet: (h.story_text || h._highlightResult?.title?.value || "")
          .replace(/<[^>]*>/g, "")
          .slice(0, 220),
        author: h.author ? `@${h.author}` : "",
        date: h.created_at || null,
        engagement: points,
        stats: [
          { label: "points", value: points },
          { label: "comments", value: Number(h.num_comments || 0) },
        ],
        // The discussion is often more valuable than the link itself.
        discussionUrl: `https://news.ycombinator.com/item?id=${h.objectID}`,
      };
    });

  // Ordering is owned by channels.js, which sorts every source newest-first.
  return { results };
}
