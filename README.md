# Relevant Search

One query &rarr; results from the **web, Twitter/X, Instagram and LinkedIn**, side by
side in one place.

Built with Next.js.

---

## Quick start

```bash
npm install
cp .env.local.example .env.local   # add your Tavily key
npm run dev
```

Open <http://localhost:3000>.

```bash
npm test    # 16 tests, no network required
```

---

## What it does

- **Four platforms, one search.** Web, X, Instagram and LinkedIn, fetched in parallel
  and split into tabs.
- **AI suggestions as you type.** Type `how do i make that bread with the sour taste`
  and pick from `sourdough bread recipe`, `how to make sour bread`, and so on. You
  choose &mdash; nothing is rewritten behind your back.
- **Relevant or Recent.** A toggle that restricts results to the past month, which
  pushes past big evergreen pages to actual recent posts.
- **Recent searches.** Your last 6 queries, stored in the browser.

---

## How it works

```
query
  -> 4 channels fetched in parallel                (lib/channels.js)
       web  |  x.com  |  instagram.com  |  linkedin.com
  -> results deduped and host-verified             (lib/channels.js)
  -> UI: one tab per channel                       (app/page.js)

typing (debounced, separate path)
  -> Groq suggests 5 queries                       (lib/ai.js)
```

| File | Role |
| --- | --- |
| `lib/providers.js` | Tavily calls, normalising and error classification |
| `lib/channels.js` | The 4 channels, parallel fan-out, dedupe, host check |
| `lib/ai.js` | Groq: query suggestions |
| `lib/cache.js` | 10-minute TTL cache so repeats don't burn quota |
| `app/api/search/route.js` | `/api/search?q=&range=` |
| `app/api/suggest/route.js` | `/api/suggest?q=` |
| `app/page.js` | The whole UI |

---

## Why there are no official Twitter / Instagram / LinkedIn APIs here

This is the part worth understanding, because it drives the whole design.

| Platform | Free read API? | Reality |
| --- | --- | --- |
| **Twitter / X** | No | The free tier is write-only. Reading or searching tweets starts around **$200/month**. |
| **Instagram** | No | No public search API. The Graph API only reads *your own* business account. |
| **LinkedIn** | No | Content APIs are partner-only. Scraping is blocked hard and breaches their terms. |

So instead of scraping the platforms, this app asks Tavily for results **restricted to
each domain**. It returns the same public posts and profiles a person would find by
searching that platform on Google &mdash; no scraping, no terms-of-service problem, no
paid tier.

`lib/channels.js` then re-checks every result's hostname, so a stray off-platform
result can never be mislabelled as coming from a platform. The test suite pins this,
including rejecting lookalike domains like `x.com.evil.net`.

---

## Keys

| Key | Required? | Free tier | What it does |
| --- | --- | --- | --- |
| `TAVILY_API_KEY` | **Yes** | 1000 searches/mo | All search results |
| `GROQ_API_KEY` | No | generous | The suggestions dropdown |

**Watch your Tavily quota.** Each app search costs **4 requests** &mdash; one per
channel &mdash; so 1000/month is roughly **250 searches**. The 10-minute cache in
`lib/cache.js` softens repeats.

Groq is optional and off the critical path: if the key is missing or rate-limited,
suggestions quietly stop appearing and search keeps working normally.

Groq rotates its free model lineup, so a hardcoded model name will eventually 404.
Run `npm run models` to list what your key can actually access.

---

## Known limits

- **LinkedIn `/in/` profile URLs are login walls.** LinkedIn returns HTTP 999 with an
  authwall for logged-out visitors, rendered in the visitor's regional language. The
  app sorts those below real content, flags them `login required`, and pins
  `?locale=en_US`. Posts, articles and learning pages open fine.
- **"Recent" thins out the Web channel.** Social platforms produce fresh content
  constantly; general web pages on a topic are mostly older guides. Expect the Web tab
  to shrink noticeably in Recent mode while the social tabs hold up.
- **No dates on results.** Tavily does not return `published_date` on general search,
  so Recent is a *filter*, not a sort, and cards cannot show how old something is.

---

## Deploying

Push to GitHub, import the repo on [Vercel](https://vercel.com), add your env vars in
the project settings.

**Never commit `.env.local`** &mdash; it is gitignored. `.env.local.example` is the file
that gets committed, and it holds no real keys.
