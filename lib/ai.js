/**
 * Groq - free tier, OpenAI-compatible, very fast.
 * Get a key at https://console.groq.com and put it in .env.local
 *
 * Every function here degrades to null when no key is set, so the app stays
 * fully usable as a plain meta-search without any AI.
 */

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
// Groq rotates its free lineup, so verify with `npm run models` before changing.
// gpt-oss is a reasoning model: it spends tokens on a hidden `reasoning` field
// before emitting `content`, so every max_tokens budget here must leave room for
// that. Too small a budget yields an empty string, not an error.
const MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

export function aiEnabled() {
  return Boolean(process.env.GROQ_API_KEY);
}

async function chat(messages, { json = false, maxTokens = 1200, retry = true } = {}) {
  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.2,
      max_tokens: maxTokens,
      // Keep the hidden reasoning pass short - this is summarising, not maths.
      reasoning_effort: "low",
      ...(json ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (res.status === 429 && retry) {
    // Free tier is 8000 tokens/min. Groq tells us exactly how long to wait.
    const body = await res.text();
    const wait = Number(/try again in ([\d.]+)s/.exec(body)?.[1] ?? 8);
    await new Promise((r) => setTimeout(r, Math.min(wait + 0.5, 20) * 1000));
    return chat(messages, { json, maxTokens, retry: false });
  }
  if (!res.ok) throw new Error(`Groq HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

/**
 * How each category steers the suggestions. The wording matters more than it
 * looks: "react" under Discussion and under Learn should produce genuinely
 * different queries, otherwise the category is decoration.
 */
const CATEGORY_HINT = {
  code: "The user wants libraries, repositories and implementation. Favour queries about packages, source code, and how something is built.",
  discussion:
    "The user wants opinions and debate. Favour queries about experiences, criticism, comparisons of approach, and whether something is worth using.",
  learn:
    "The user wants to learn. Favour tutorial-shaped queries: how to do something, explanations, beginner and walkthrough phrasing.",
};

/**
 * Turn whatever the user has typed so far into a few concrete search queries
 * they can pick from. Returns [] on any failure so the UI simply shows nothing
 * rather than blocking typing.
 */
export async function suggestQueries(partial, category = "") {
  if (!aiEnabled()) return [];
  const text = partial.trim();
  if (text.length < 3) return [];

  try {
    const raw = await chat(
      [
        {
          role: "system",
          content:
            "You suggest web search queries. Given the user's partial or " +
            "conversational input, return 5 short, concrete search queries they " +
            "might mean. Keep proper nouns exactly. Each under 60 characters. " +
            (CATEGORY_HINT[category] ? CATEGORY_HINT[category] + " " : "") +
            'Reply with JSON only: {"suggestions":["query one","query two"]}',
        },
        { role: "user", content: text },
      ],
      { json: true, maxTokens: 500 }
    );

    const list = JSON.parse(raw).suggestions;
    if (!Array.isArray(list)) return [];

    const seen = new Set();
    return list
      .filter((s) => typeof s === "string")
      .map((s) => s.trim())
      .filter((s) => {
        const key = s.toLowerCase();
        if (!s || s.length > 80 || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 5);
  } catch (err) {
    console.error("suggestQueries failed:", err.message);
    return [];
  }
}
