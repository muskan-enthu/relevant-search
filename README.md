# Relevant Search

One query &rarr; what **Hacker News, YouTube and GitHub** are saying, ranked by real
engagement.

Built with Next.js. Two of the three channels work with no credentials at all.

---

## Quick start

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. Hacker News and GitHub work immediately &mdash; no keys.

```bash
npm test    # 19 tests, no network required
```

---

## What it does

- **Three sources, one query**, fetched in parallel and split into tabs.
- **Real engagement data.** Upvotes, points, views, stars &mdash; actual numbers from
  each platform, not a relevance score someone else invented.
- **AI suggestions as you type.** Type `how do i make that bread with the sour taste`
  and pick from `sourdough bread recipe`, `how to make sour bread`, and so on. You
  choose &mdash; nothing is rewritten behind your back.
- **Recent searches.** Your last 6 queries, kept in the browser.

---

## The three channels

| Channel | Engagement shown | Sorted by | Credentials |
| --- | --- | --- | --- |
| **Hacker News** | points, comments | most points | none |
| **GitHub** | stars, forks | most stars | none (token optional) |
| **YouTube** | views, likes, comments | most views | API key |

GitHub sorts by stars rather than date on purpose: `pushed_at` is the only timestamp
it offers, and every actively-maintained repo was pushed today, so a date sort would
order results arbitrarily. That source returns no date at all.

---

## How it works

```
query
  -> 3 sources fetched in parallel, each via its own API   (lib/channels.js)
  -> deduped, then sorted by that channel's basis          (lib/channels.js)
  -> UI: one tab per channel                               (app/page.js)

typing (debounced, separate path)
  -> Groq suggests 5 queries                               (lib/ai.js)
```

| File | Role |
| --- | --- |
| `lib/sources/*.js` | One file per platform: fetch, normalise, classify errors |
| `lib/channels.js` | Parallel fan-out, dedupe, per-channel sort |
| `lib/ai.js` | Groq: query suggestions |
| `lib/cache.js` | 10-minute TTL cache so repeats don't burn quota |
| `app/api/search/route.js` | `/api/search?q=` |
| `app/api/suggest/route.js` | `/api/suggest?q=` |
| `app/page.js` | The whole UI |

Every source returns the same shape, so adding a fourth is one file plus one entry in
`CHANNELS`:

```js
{ title, url, snippet, author, date, engagement, stats: [{ label, value }] }
```

---

## Optional keys

None are required. Each unlocks one channel.

**YouTube** &mdash; [console.cloud.google.com](https://console.cloud.google.com), enable
"YouTube Data API v3", create an API key. No billing account needed.
Quota: **100 searches/day**.

**GitHub** (optional) &mdash;
[github.com/settings/tokens](https://github.com/settings/tokens), **no scopes ticked**.
Raises 10 &rarr; 30 searches/min. Worth setting before deploying: serverless
platforms share egress IPs, so the unauthenticated limit is shared with strangers.

**Groq** (optional) &mdash; [console.groq.com](https://console.groq.com). Powers the
suggestions dropdown. Groq rotates its free model lineup, so run `npm run models` to
see what your key can actually access.

---

## Why these three platforms

Because they are the ones that still give engagement data away.

| Platform | Engagement data | Verdict |
| --- | --- | --- |
| Hacker News, GitHub | free, no key | **in** |
| YouTube | free, needs registration | **in** |
| **X / Twitter** | ~$200/month | out |
| **Reddit** | free, but needs OAuth registration | out (removed) |
| **Instagram, LinkedIn** | no free API at all | out |
| **Open web** | no such concept exists | out |

X, Instagram and LinkedIn were all built and then removed. Their content is reachable
through a search index, but it arrives with no upvotes, likes or view counts &mdash;
which defeats the point of ranking by engagement. Browser-cookie and paid-scraper
workarounds exist, but neither survives deployment to a public URL.

---

## Known limits

- **Coverage is developer-heavy.** Hacker News and GitHub are technical by nature.
  "next.js" and "ai agents" return excellent results; "makeup tutorials" will not.
  YouTube is the broad channel.
- **A source failing is shown, never hidden.** A rate limit, a bad key or a network
  outage produces a message on that tab; the other three keep working. Tests pin the
  difference between "no results" and "this broke", because conflating them hid real
  outages during development.

---

## Deploying

Push to GitHub, import the repo on [Vercel](https://vercel.com), add your env vars in
the project settings.

**Never commit `.env.local`** &mdash; it is gitignored. `.env.local.example` is the file
that gets committed, and it holds no real keys.
