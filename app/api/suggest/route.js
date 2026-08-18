import { NextResponse } from "next/server";
import { suggestQueries } from "@/lib/ai";
import { cacheGet, cacheSet } from "@/lib/cache";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const q = (request.nextUrl.searchParams.get("q") || "").trim();
  if (q.length < 3 || q.length > 200) return NextResponse.json({ suggestions: [] });

  // Typing revisits the same prefixes constantly - cache or we burn the quota.
  const key = `suggest:${q.toLowerCase()}`;
  const hit = cacheGet(key);
  if (hit) return NextResponse.json({ suggestions: hit });

  const suggestions = await suggestQueries(q);
  if (suggestions.length) cacheSet(key, suggestions);

  return NextResponse.json({ suggestions });
}
