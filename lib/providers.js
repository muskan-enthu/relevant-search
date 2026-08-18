/**
 * Tavily is the only search provider.
 *
 * It has a real include_domains parameter, so the per-platform channels are a
 * genuine domain filter rather than a site: string appended to the query.
 *
 * Results are normalised to { title, url, snippet }.
 */

const TAVILY_URL = "https://api.tavily.com/search";
const TIMEOUT_MS = 12000;

/** No key configured - the app cannot search at all. */
export class ProviderNotConfiguredError extends Error {
  constructor() {
    super("TAVILY_API_KEY is not set");
    this.name = "ProviderNotConfiguredError";
  }
}

/** Key rejected, or the monthly quota / rate limit is exhausted. */
export class ProviderBlockedError extends Error {
  constructor(detail) {
    super(detail);
    this.name = "ProviderBlockedError";
  }
}

/** Could not reach Tavily at all (DNS, refused, timeout). */
export class ProviderUnreachableError extends Error {
  constructor(cause) {
    super(`tavily is unreachable: ${cause}`);
    this.name = "ProviderUnreachableError";
  }
}

export function activeProvider() {
  return "tavily";
}

export function isConfigured() {
  return Boolean(process.env.TAVILY_API_KEY);
}

/**
 * @param {string} query
 * @param {object} opts
 * @param {string[]} opts.domains  restrict results to these domains
 * @param {number} opts.count      max results wanted
 * @param {string} opts.range      "" | "week" | "month" - recent window only
 */
export async function search(query, { domains = [], count = 8, range = "" } = {}) {
  if (!isConfigured()) throw new ProviderNotConfiguredError();

  let res;
  try {
    res = await fetch(TAVILY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.TAVILY_API_KEY}`,
      },
      body: JSON.stringify({
        query,
        max_results: count,
        search_depth: "basic",
        include_domains: domains,
        ...(range ? { time_range: range } : {}),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    // A refused connection / DNS failure / timeout throws before any status
    // exists. Left unhandled this would look like an empty result set, and a
    // network outage must never be presented to the user as "nothing found".
    throw new ProviderUnreachableError(err.message);
  }

  if (res.status === 401 || res.status === 403) {
    throw new ProviderBlockedError("Tavily rejected the API key.");
  }
  if (res.status === 429 || res.status === 432) {
    throw new ProviderBlockedError(
      "Tavily quota or rate limit reached. Each search costs 4 requests, " +
        "so the free 1000/month covers about 250 searches."
    );
  }
  if (!res.ok) throw new Error(`Tavily HTTP ${res.status}`);

  const data = await res.json();
  return (data.results || []).map((r) => ({
    title: r.title,
    url: r.url,
    snippet: r.content || "",
  }));
}
