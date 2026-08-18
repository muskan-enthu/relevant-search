/**
 * A failing provider must never look like "no results found".
 *
 * This is the bug class that bit hardest during development: a network error or
 * a rejected key returned an empty array, the UI rendered "nothing found", and
 * nothing anywhere said the search had actually failed.
 */
import {
  search,
  ProviderBlockedError,
  ProviderUnreachableError,
  ProviderNotConfiguredError,
} from "../lib/providers.js";

let pass = 0,
  fail = 0;
const check = (name, got, want) => {
  const ok = got === want;
  console.log((ok ? "  PASS  " : "  FAIL  ") + name + (ok ? "" : `  (got ${got}, want ${want})`));
  ok ? pass++ : fail++;
};

function stubStatus(status, body = { results: [] }) {
  globalThis.fetch = async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

// Returns "blocked" | "unconfigured" | "unreachable" | "empty" | "results" | "error"
async function outcome() {
  try {
    const r = await search("anything", { domains: [] });
    return r.length ? "results" : "empty";
  } catch (e) {
    if (e instanceof ProviderNotConfiguredError) return "unconfigured";
    if (e instanceof ProviderBlockedError) return "blocked";
    if (e instanceof ProviderUnreachableError) return "unreachable";
    return "error";
  }
}

delete process.env.TAVILY_API_KEY;
stubStatus(200);
check("missing key -> unconfigured, NOT empty", await outcome(), "unconfigured");

process.env.TAVILY_API_KEY = "test-key";

stubStatus(401);
check("401 bad key -> blocked", await outcome(), "blocked");

stubStatus(403);
check("403 forbidden -> blocked", await outcome(), "blocked");

stubStatus(429);
check("429 rate limited -> blocked", await outcome(), "blocked");

stubStatus(432);
check("432 quota exhausted -> blocked", await outcome(), "blocked");

globalThis.fetch = async () => {
  throw new TypeError("fetch failed");
};
check("network failure -> unreachable, NOT empty", await outcome(), "unreachable");

globalThis.fetch = async () => {
  throw new Error("operation aborted due to timeout");
};
check("timeout -> unreachable, NOT empty", await outcome(), "unreachable");

stubStatus(200, { results: [] });
check("200 with no matches -> empty, NOT an error", await outcome(), "empty");

stubStatus(200, { results: [{ title: "t", url: "https://a.com/x", content: "s" }] });
check("200 with matches -> results", await outcome(), "results");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
