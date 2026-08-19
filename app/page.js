"use client";

import { useEffect, useRef, useState } from "react";

const RECENT_KEY = "relevant-search:recent";
const RECENT_MAX = 6;

/* Per-channel accent, used for the active tab and card hover rail. */
const TINT = {
  hackernews: "#f26522",
  youtube: "#e0284a",
  github: "#7c5cd6",
};

/* Shown only until the user has a search history of their own. */
const EXAMPLES = [
  "next.js updates",
  "react.js vs next.js",
  "web development",
  "Ai engines",
];

export default function Home() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("hackernews");
  const [recent, setRecent] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [sugOpen, setSugOpen] = useState(false);
  const [sugIndex, setSugIndex] = useState(-1);

  // Guards against a slow early request overwriting a newer one's suggestions.
  const sugToken = useRef(0);
  const formRef = useRef(null);

  // Close the dropdown on any click outside the search bar. A blur handler
  // cannot do this job: the list preventDefaults mousedown to keep focus in the
  // input, so blur never fires when clicking the list itself.
  useEffect(() => {
    if (!sugOpen) return;

    function onPointerDown(e) {
      if (formRef.current && !formRef.current.contains(e.target)) {
        setSugOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [sugOpen]);

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

  async function run(q) {
    const text = (q ?? query).trim();
    if (!text || loading) return;

    setQuery(text);
    setLoading(true);
    setError(null);
    setData(null);

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(text)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Search failed");

      setData(json);
      // Only remember searches that actually returned something.
      if (json.meta.totalResults > 0) remember(text);

      // A channel with no credentials is hidden entirely rather than shown as a
      // permanently empty tab, so never land on one.
      const shown = json.channels.filter((c) => !c.unconfigured);
      const firstFull = shown.find((c) => c.results.length > 0) || shown[0];
      setTab(firstFull ? firstFull.id : "hackernews");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Unconfigured channels are hidden: the code stays wired up, so adding the
  // key later makes the tab reappear with no other change.
  const visible = data?.channels.filter((c) => !c.unconfigured) ?? [];
  const active = visible.find((c) => c.id === tab);
  const tint = TINT[tab] || undefined;

  return (
    <main className="wrap">
      <header className="hero">
        <h1>Searching..</h1>
        <p className="tagline">
          One query, ranked by what people are actually engaging with.
        </p>
      </header>

      <form
        className="searchbar"
        ref={formRef}
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
            {visible.map((c) => (
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
                {active?.error ? (
                  <>
                    <strong>{active.label} could not be searched</strong>
                    <span>{active.error}</span>
                  </>
                ) : (
                  <>
                    <strong>Nothing found on {active?.label}</strong>
                    <span>Try rephrasing, or check another tab.</span>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="foot">
            <em>{data.meta.totalResults} results</em>
            <em>{(data.meta.elapsedMs / 1000).toFixed(1)}s</em>
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
        <span className="host">{result.author || host}</span>
        {result.date && <span className="when">{ago(result.date)}</span>}
      </div>
      <h3>{result.title}</h3>
      {result.snippet && <p>{result.snippet}</p>}
      {result.stats?.length > 0 && (
        <div className="stats">
          {result.stats.map((s) => (
            <span key={s.label}>
              <b>{typeof s.value === "number" ? compact(s.value) : s.value}</b> {s.label}
            </span>
          ))}
        </div>
      )}
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
  if (id === "hackernews") return <Icon.HN />;
  if (id === "youtube") return <Icon.YouTube />;
  if (id === "github") return <Icon.GitHub />;
  return <Icon.Globe />;
}

/* 12345 -> "12.3K" so counts stay one glanceable token. */
function compact(n) {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return (n / 1000).toFixed(n < 10_000 ? 1 : 0) + "K";
  return (n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0) + "M";
}

function ago(iso) {
  const days = Math.floor((Date.now() - new Date(iso)) / 86400000);
  if (Number.isNaN(days)) return "";
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
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
  HN: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M3 3h18v18H3zm9.6 10.6L16.5 7h-1.9l-2.6 4.7L9.4 7H7.5l3.9 6.6V17h1.2z" />
    </svg>
  ),
  YouTube: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
      <path d="M21.6 7.2a2.5 2.5 0 0 0-1.75-1.77C18.25 5 12 5 12 5s-6.25 0-7.85.43A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.75 1.77C5.75 19 12 19 12 19s6.25 0 7.85-.43a2.5 2.5 0 0 0 1.75-1.77A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8zM10 15.2V8.8l5.2 3.2z" />
    </svg>
  ),
  GitHub: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2z" />
    </svg>
  ),
};
