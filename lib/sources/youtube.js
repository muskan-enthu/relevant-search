/**
 * YouTube Data API v3.
 *
 * Free, but the default project quota allows only 100 search.list calls per
 * day, so this is the scarcest source in the app. videos.list draws from a
 * separate 10,000-unit pool, so enriching the results with statistics is
 * effectively free once the search has been paid for.
 *
 * Two calls are needed: search.list returns no view or like counts, so the ids
 * it returns are passed to videos.list to get the statistics.
 */

const SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";
const VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos";
const TIMEOUT_MS = 12000;

export function isConfigured() {
  return Boolean(process.env.YOUTUBE_API_KEY);
}

export async function searchYouTube(query, { count = 8 } = {}) {
  if (!isConfigured()) return { results: [], unconfigured: true };

  const key = process.env.YOUTUBE_API_KEY;

  const searchParams = new URLSearchParams({
    key,
    part: "snippet",
    q: query,
    type: "video",
    maxResults: String(count),
    order: "relevance",
  });

  const found = await getJson(`${SEARCH_URL}?${searchParams}`);
  const ids = (found.items || []).map((i) => i.id?.videoId).filter(Boolean);
  if (!ids.length) return { results: [] };

  const stats = await getJson(
    `${VIDEOS_URL}?${new URLSearchParams({
      key,
      part: "statistics,snippet",
      id: ids.join(","),
    })}`
  );

  const results = (stats.items || []).map((v) => {
    const s = v.statistics || {};
    const views = Number(s.viewCount || 0);
    return {
      title: v.snippet?.title || "",
      url: `https://www.youtube.com/watch?v=${v.id}`,
      snippet: (v.snippet?.description || "").slice(0, 220),
      author: v.snippet?.channelTitle || "",
      date: v.snippet?.publishedAt || null,
      engagement: views,
      stats: [
        { label: "views", value: views },
        { label: "likes", value: Number(s.likeCount || 0) },
        { label: "comments", value: Number(s.commentCount || 0) },
      ],
    };
  });

  // Ordering is owned by channels.js, which sorts every source newest-first.
  return { results };
}

async function getJson(url) {
  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    throw new Error(`youtube unreachable: ${err.message}`);
  }

  if (res.status === 403) {
    // 403 covers three very different problems, and telling them apart is the
    // difference between "wait until tomorrow" and "flip a switch in the
    // console". Saying just "bad key" sent a real user hunting the wrong thing.
    const body = await res.text();
    if (/quota/i.test(body)) {
      throw new Error("YouTube daily quota exhausted (100 searches/day). Resets at midnight Pacific.");
    }
    // Google distinguishes these two precisely, and the fixes are different.
    if (/API_KEY_SERVICE_BLOCKED/.test(body)) {
      throw new Error(
        "This API key is restricted and does not allow YouTube Data API v3. " +
          "In Google Cloud Console: Credentials -> your key -> API restrictions."
      );
    }
    if (/SERVICE_DISABLED|not been used|disabled/i.test(body)) {
      throw new Error(
        "YouTube Data API v3 is not enabled on this key's project. " +
          "Enable it in Google Cloud Console."
      );
    }
    throw new Error("YouTube rejected the API key.");
  }
  if (!res.ok) throw new Error(`YouTube HTTP ${res.status}`);
  return res.json();
}
