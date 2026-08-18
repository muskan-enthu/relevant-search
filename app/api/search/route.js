import { NextResponse } from "next/server";
import { searchAllChannels } from "@/lib/channels";
import { aiEnabled } from "@/lib/ai";
import {
  activeProvider,
  ProviderBlockedError,
  ProviderUnreachableError,
  ProviderNotConfiguredError,
} from "@/lib/providers";
import { cacheGet, cacheSet, CACHE_VERSION } from "@/lib/cache";

// Always hit the network - never serve a cached build of this route.
export const dynamic = "force-dynamic";

export async function GET(request) {
  const query = (request.nextUrl.searchParams.get("q") || "").trim();

  // "" = rank by relevance only. "week"/"month" restrict to a recent window.
  const rangeParam = request.nextUrl.searchParams.get("range") || "";
  const range = ["week", "month"].includes(rangeParam) ? rangeParam : "";

  if (!query) {
    return NextResponse.json({ error: "Missing query parameter ?q=" }, { status: 400 });
  }
  if (query.length > 300) {
    return NextResponse.json({ error: "Query too long (max 300 chars)" }, { status: 400 });
  }

  const cacheKey = `v${CACHE_VERSION}:${activeProvider()}:${aiEnabled()}:${range}:${query.toLowerCase()}`;
  const cached = cacheGet(cacheKey);
  if (cached) {
    return NextResponse.json({ ...cached, meta: { ...cached.meta, cached: true } });
  }

  const startedAt = Date.now();

  try {
    // Searched exactly as typed. Rewriting happens up front as visible
    // suggestions the user picks from, never silently here.
    //
    // The provider's own ranking is kept as-is: an AI rerank cost a second
    // round-trip and most of the 8000 tok/min budget for a marginal reorder.
    const channels = await searchAllChannels(query, { range });

    const payload = {
      query,
      range,
      channels,
      meta: {
        provider: activeProvider(),
        aiEnabled: aiEnabled(),
        totalResults: channels.reduce((n, c) => n + c.results.length, 0),
        elapsedMs: Date.now() - startedAt,
        cached: false,
      },
    };

    if (payload.meta.totalResults > 0) cacheSet(cacheKey, payload);
    return NextResponse.json(payload);
  } catch (err) {
    if (err instanceof ProviderNotConfiguredError) {
      return NextResponse.json(
        {
          error:
            "No TAVILY_API_KEY set. Copy .env.local.example to .env.local and " +
            "add a free key from https://tavily.com, then restart the dev server.",
          providerNotConfigured: true,
        },
        { status: 503 }
      );
    }
    if (err instanceof ProviderUnreachableError) {
      return NextResponse.json(
        { error: "Could not reach Tavily - check your internet connection.", providerUnreachable: true },
        { status: 503 }
      );
    }
    if (err instanceof ProviderBlockedError) {
      return NextResponse.json(
        { error: err.message, providerBlocked: true },
        { status: 503 }
      );
    }
    console.error("search route failed:", err);
    return NextResponse.json({ error: "Search failed. Please try again." }, { status: 500 });
  }
}
