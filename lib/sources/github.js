/**
 * GitHub search API.
 *
 * Needs no key at all: 10 searches/minute unauthenticated. Setting
 * GITHUB_TOKEN (any free personal access token, no scopes required) raises
 * that to 30/minute.
 *
 * Returns real engagement - stars and forks - so results are ranked by stars.
 *
 * No date is returned: pushed_at is the only timestamp available, and every
 * actively-maintained repo was pushed today, which makes it useless to sort or
 * display.
 */

const SEARCH_URL = "https://api.github.com/search/repositories";
const TIMEOUT_MS = 12000;

export function isConfigured() {
  return true; // works unauthenticated
}

export async function searchGitHub(query, { count = 8 } = {}) {
  const params = new URLSearchParams({
    q: query,
    sort: "stars",
    order: "desc",
    per_page: String(count),
  });

  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "relevant-search",
    ...(process.env.GITHUB_TOKEN
      ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
      : {}),
  };

  let res;
  try {
    res = await fetch(`${SEARCH_URL}?${params}`, {
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new Error(`github unreachable: ${err.message}`);
  }

  if (res.status === 403 || res.status === 429) {
    throw new Error(
      "GitHub rate limit reached (10 searches/min without a token). " +
        "Set GITHUB_TOKEN to raise it to 30/min."
    );
  }
  if (!res.ok) throw new Error(`GitHub HTTP ${res.status}`);

  const data = await res.json();
  return {
    results: (data.items || []).map((r) => ({
      title: r.full_name,
      url: r.html_url,
      snippet: r.description || "",
      author: r.owner?.login || "",
      engagement: r.stargazers_count || 0,
      stats: [
        { label: "stars", value: r.stargazers_count || 0 },
        { label: "forks", value: r.forks_count || 0 },
        ...(r.language ? [{ label: "lang", value: r.language }] : []),
      ],
    })),
  };
}
