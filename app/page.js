"use client";

import { useEffect, useRef, useState } from "react";

const RECENT_KEY = "relevant-search:recent";
const RECENT_MAX = 6;

/* Per-channel accent, used for the active tab and card hover rail. */
const TINT = {
  web: "#0ea5e9",
  twitter: "#71717a",
  instagram: "#d6249f",
  linkedin: "#0a66c2",
};

/* Shown only until the user has a search history of their own. */
const EXAMPLES = [
  "next.js updates",
  "react.js vs next.js",
  "web development",
  "Ai engines",
];

/**
 * "" ranks purely by relevance, which drifts toward big evergreen pages.
 * A time window pushes past those to actual recent posts, at the cost of
 * returning fewer results on quiet topics.
 *
 * "Recent" maps to a month rather than a week: a week is thin enough to come
 * back empty on niche queries, which reads as a broken app.
 */
const RANGES = [
  { id: "", label: "Relevant" },
  { id: "month", label: "Recent" },
];

export default function Home() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("web");
  const [range, setRange] = useState("");
  const [recent, setRecent] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [sugOpen, setSugOpen] = useState(false);
  const [sugIndex, setSugIndex] = useState(-1);

  // Guards against a slow early request overwriting a newer one's suggestions.
  const sugToken = useRef(0);

  // Debounced: the user is mid-word most of the time, and every keystroke would
  // otherwise be a Groq call against an 8000 tok/min budget.
  useEffect(() => {
    const text = query.trim();
    if (!sugOpen || text.length < 3) {
      setSuggestions([]);
      return;
    }

    const token = ++sugToken.current;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/suggest?q=${encodeURIComponent(text)}`);
        const json = await res.json();
        if (token === sugToken.current) {
          setSuggestions(json.suggestions || []);
          setSugIndex(-1);
        }
      } catch {
        // Suggestions are optional - never let them break typing.
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [query, sugOpen]);

  function pickSuggestion(text) {
    sugToken.current++; // invalidate any in-flight request
    setSugOpen(false);
    setSuggestions([]);
    setSugIndex(-1);
    run(text);
  }

  function onSearchKeyDown(e) {
    if (!suggestions.length) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSugIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSugIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter" && sugIndex >= 0) {
      e.preventDefault();
      pickSuggestion(suggestions[sugIndex]);
    } else if (e.key === "Escape") {
      setSugOpen(false);
    }
  }

  // Read after mount, never during render: the server has no localStorage, so
  // seeding state from it directly would cause a hydration mismatch.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
      if (Array.isArray(saved))
        setRecent(saved.filter((q) => typeof q === "string"));
    } catch {
      // Corrupt or unavailable storage just means no history.
    }
  }, []);

  function remember(text) {
    setRecent((prev) => {
      const next = [
        text,
        ...prev.filter((q) => q.toLowerCase() !== text.toLowerCase()),
      ].slice(0, RECENT_MAX);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  function clearRecent() {
    setRecent([]);
    try {
      localStorage.removeItem(RECENT_KEY);
    } catch {}
  }

  async function run(q, r, keepTab = false) {
    const text = (q ?? query).trim();
    const useRange = r ?? range;
    if (!text || loading) return;

    setQuery(text);
    setRange(useRange);
    setLoading(true);
    setError(null);
    setData(null);

    try {
      const res = await fetch(
        `/api/search?q=${encodeURIComponent(text)}` +
          (useRange ? `&range=${useRange}` : ""),
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Search failed");

      setData(json);
      // Only remember searches that actually returned something.
      if (json.meta.totalResults > 0) remember(text);
      // Toggling freshness re-runs the search, but the user is still reading the
      // same channel - yanking them back to Web would lose their place.
      if (!keepTab) {
        const firstFull = json.channels.find((c) => c.results.length > 0);
        setTab(firstFull ? firstFull.id : "web");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const active = data?.channels.find((c) => c.id === tab);
  const tint = TINT[tab] || undefined;

  return (
    <main className="wrap">
      <header className="hero">
        <h1>Searching..</h1>
        <p className="tagline">
          Search the web, X, Instagram and LinkedIn — all from one query.
        </p>
      </header>

      <form
        className="searchbar"
        onSubmit={(e) => {
          e.preventDefault();
          setSugOpen(false);
          run();
        }}
      >
        <span className="glass">
          <Icon.Search />
        </span>
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSugOpen(true);
          }}
          onKeyDown={onSearchKeyDown}
          onFocus={() => setSugOpen(true)}
          placeholder="Search anything…"
          aria-label="Search query"
          aria-autocomplete="list"
          aria-expanded={sugOpen && suggestions.length > 0}
          autoComplete="off"
          autoFocus
        />
        <button
          className="btn-search"
          type="submit"
          disabled={loading || !query.trim()}
        >
          {loading ? <span className="spinner" /> : <Icon.Arrow />}
          <span className="lbl">{loading ? "Searching" : "Search"}</span>
        </button>

        {sugOpen && suggestions.length > 0 && (
          <ul
            className="suggest"
            role="listbox"
            // Keep focus in the input so the list does not close before the click.
            onMouseDown={(e) => e.preventDefault()}
          >
            {suggestions.map((s, i) => (
              <li key={s}>
                <button
                  type="button"
                  role="option"
                  aria-selected={i === sugIndex}
                  data-active={i === sugIndex}
                  onMouseEnter={() => setSugIndex(i)}
                  onClick={() => pickSuggestion(s)}
                >
                  <Icon.Search />
                  {s}
                </button>
              </li>
            ))}
          </ul>
        )}
      </form>

      <div className="ranges" role="group" aria-label="Result freshness">
        {RANGES.map((r) => (
          <button
            key={r.id}
            className="range"
            data-active={r.id === range}
            disabled={loading}
            onClick={() => {
              setRange(r.id);
              // Only re-search if there is something to re-search.
              if (query.trim() && (data || error)) run(query, r.id, true);
            }}
          >
            {r.label}
          </button>
        ))}
      </div>

      {!data && !loading && !error && (
        <>
          <p className="chips-label">
            {recent.length ? "Recent searches" : "Try one of these"}
            {recent.length > 0 && (
              <button className="chips-clear" onClick={clearRecent}>
                Clear
              </button>
            )}
          </p>
          <div className="chips">
            {(recent.length ? recent : EXAMPLES).map((e) => (
              <button key={e} className="chip" onClick={() => run(e)}>
                {e}
              </button>
            ))}
          </div>
        </>
      )}

      {loading && <Skeletons />}

      {error && (
        <div className="alert">
          <Icon.Alert />
          <div>
            <strong>Search could not complete</strong>
            <span>{error}</span>
          </div>
        </div>
      )}

      {data && (
        <>
          <nav className="tabs">
            {data.channels.map((c) => (
              <button
                key={c.id}
                className="tab"
                data-active={c.id === tab}
                data-empty={c.results.length === 0}
                style={{ "--tint": TINT[c.id] }}
                onClick={() => setTab(c.id)}
              >
                <ChannelIcon id={c.id} />
                {c.label}
                <span className="n">{c.results.length}</span>
              </button>
            ))}
          </nav>

          <div className="results">
            {active?.results.length ? (
              active.results.map((r, i) => (
                <Card key={r.url + i} result={r} tint={tint} index={i} />
              ))
            ) : (
              <div className="empty">
                <Icon.Empty />
                <strong>Nothing found on {active?.label}</strong>
                <span>
                  {active?.id === "linkedin"
                    ? "LinkedIn blocks most crawlers, so this channel is often thin."
                    : "Try rephrasing, or check another tab."}
                </span>
              </div>
            )}
          </div>

          <div className="foot">
            <em>{data.meta.totalResults} results</em>
            <em>{(data.meta.elapsedMs / 1000).toFixed(1)}s</em>
            <em>via {data.meta.provider}</em>
            {data.meta.cached && <em>cached</em>}
          </div>
        </>
      )}
    </main>
  );
}

/* ------------------------------------------------------------------ */

function Card({ result, tint, index }) {
  let host = result.url;
  try {
    host = new URL(result.url).host.replace(/^www\./, "");
  } catch {}

  return (
    <a
      className="card"
      href={result.url}
      target="_blank"
      rel="noopener noreferrer"
      style={{ "--tint": tint, animationDelay: `${Math.min(index, 8) * 35}ms` }}
    >
      <div className="card-top">
        <img
          className="fav"
          src={`https://www.google.com/s2/favicons?domain=${host}&sz=64`}
          alt=""
          loading="lazy"
          onError={(e) => {
            e.currentTarget.style.visibility = "hidden";
          }}
        />
        <span className="host">{host}</span>
        {result.authwalled && <span className="pill">login required</span>}
      </div>
      <h3>{result.title}</h3>
      {result.snippet && <p>{result.snippet}</p>}
    </a>
  );
}

function Skeletons() {
  return (
    <div className="results" style={{ marginTop: 30 }}>
      {[0, 1, 2, 3].map((i) => (
        <div className="skel-card" key={i}>
          <div className="skel" style={{ width: "28%", marginBottom: 12 }} />
          <div
            className="skel"
            style={{ width: "72%", height: 15, marginBottom: 10 }}
          />
          <div className="skel" style={{ width: "94%" }} />
        </div>
      ))}
    </div>
  );
}

function ChannelIcon({ id }) {
  if (id === "twitter") return <Icon.X />;
  if (id === "instagram") return <Icon.Instagram />;
  if (id === "linkedin") return <Icon.LinkedIn />;
  return <Icon.Globe />;
}

/* Inline SVGs — no icon library, no network request. */
const Icon = {
  Search: () => (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  ),
  Arrow: () => (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h13M13 6l6 6-6 6" />
    </svg>
  ),
  Alert: () => (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5M12 16.2v.1" />
    </svg>
  ),
  Empty: () => (
    <svg
      width="34"
      height="34"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5M8.5 11h5" />
    </svg>
  ),
  Globe: () => (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18" />
    </svg>
  ),
  X: () => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.66l-5.21-6.82-5.96 6.82H1.68l7.73-8.84L1.25 2.25h6.83l4.71 6.23zm-1.16 17.52h1.83L7.08 4.13H5.11z" />
    </svg>
  ),
  Instagram: () => (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  ),
  LinkedIn: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9h4v12H3zM10 9h3.8v1.7h.05c.53-.95 1.83-1.95 3.76-1.95 4.02 0 4.76 2.5 4.76 5.76V21h-4v-5.7c0-1.36-.03-3.11-1.95-3.11-1.96 0-2.26 1.48-2.26 3.01V21h-4z" />
    </svg>
  ),
};
