/**
 * Marketplace catalog/search logic tests.
 *
 * Exercises the pure helpers behind GET /api/market/search:
 *   - trending score formula + trending sort order
 *   - type / tag / price / keyword filtering
 *   - facet counts over the full filtered set (before pagination)
 *   - video pricing normalization (toMarketItem)
 *
 * No live database: we build MarketItems from raw lean-doc shapes the same way
 * the controller does.
 */

import { describe, it, expect } from "vitest";
import {
  computeTrendingScore,
  toMarketItem,
  applyFilters,
  sortItems,
  computeFacets,
  relatedScore,
  rankRelated,
  toAgentCatalogItem,
  type MarketItem,
} from "../controllers/marketplaceController.js";

// ============================================================
// Fixtures
// ============================================================

const NOW = new Date("2026-06-13T00:00:00.000Z").getTime();
const DAY = 1000 * 60 * 60 * 24;

function rawDoc(overrides: Record<string, any> = {}) {
  return {
    _id: { toString: () => overrides.id || "id-default" },
    slug: "a-resource",
    type: "article",
    name: "A Resource",
    description: "Some description",
    priceUsdc: 0.05,
    tags: ["payments", "arc"],
    accessCount: 0,
    totalRevenue: 0,
    createdAt: new Date(NOW),
    config: {},
    creatorId: {
      _id: { toString: () => "creator-1" },
      username: "superdemo",
      displayName: "SuperPage Demo",
      name: "Demo",
      avatarUrl: null,
      walletAddress: "0xabc",
    },
    ...overrides,
  };
}

/** A small in-memory catalog covering all four types. */
function catalog(): MarketItem[] {
  return [
    toMarketItem(
      rawDoc({
        id: "art-1",
        type: "article",
        name: "Paying by the second",
        description: "Payment channels and proof-of-flow",
        priceUsdc: 0.05,
        tags: ["payments", "arc", "streaming"],
        accessCount: 5,
        totalRevenue: 0.25,
        createdAt: new Date(NOW - 1 * DAY),
        creatorId: { username: "superdemo", displayName: "SuperPage Demo", name: "Demo", walletAddress: "0x1" },
      }),
      NOW
    ),
    toMarketItem(
      rawDoc({
        id: "vid-1",
        type: "video",
        name: "Live from the Lepton economy",
        description: "A 90 second demo stream",
        priceUsdc: 0,
        tags: ["demo", "streaming", "arc"],
        accessCount: 50,
        totalRevenue: 2,
        createdAt: new Date(NOW - 20 * DAY),
        config: { pricePerSecondUsdc: 0.001, durationSeconds: 90, coverImage: "cover.png" },
        creatorId: { username: "superdemo", displayName: "SuperPage Demo", name: "Demo", walletAddress: "0x1" },
      }),
      NOW
    ),
    toMarketItem(
      rawDoc({
        id: "api-1",
        type: "api",
        name: "Arc Gas Oracle API",
        description: "Live Arc testnet gas price",
        priceUsdc: 0.005,
        tags: ["developer", "arc", "api"],
        accessCount: 2,
        totalRevenue: 0,
        createdAt: new Date(NOW - 30 * DAY),
        creatorId: { username: "oracle", displayName: "Oracle Co", name: "Oracle", walletAddress: "0x2" },
      }),
      NOW
    ),
    toMarketItem(
      rawDoc({
        id: "file-1",
        type: "file",
        name: "Nanopayments Design Notes",
        description: "Design notes on channel streaming",
        priceUsdc: 0.25,
        tags: ["design", "notes"],
        accessCount: 1,
        totalRevenue: 0.25,
        createdAt: new Date(NOW - 2 * DAY),
        creatorId: { username: "writer", displayName: "Writer", name: "Writer", walletAddress: "0x3" },
      }),
      NOW
    ),
  ];
}

// ============================================================
// computeTrendingScore
// ============================================================

describe("computeTrendingScore", () => {
  it("weights revenue 10x over raw access count", () => {
    const score = computeTrendingScore(10, 1, new Date(NOW - 100 * DAY), NOW);
    // 10 access + 1 revenue*10 + 0 recency (older than 14 days) = 20
    expect(score).toBe(20);
  });

  it("adds a recency boost that decays to zero after 14 days", () => {
    const fresh = computeTrendingScore(0, 0, new Date(NOW), NOW);
    const oneWeek = computeTrendingScore(0, 0, new Date(NOW - 7 * DAY), NOW);
    const old = computeTrendingScore(0, 0, new Date(NOW - 30 * DAY), NOW);
    expect(fresh).toBe(14);
    expect(oneWeek).toBeCloseTo(7, 5);
    expect(old).toBe(0);
  });

  it("never goes negative on the recency term", () => {
    expect(computeTrendingScore(0, 0, new Date(NOW - 365 * DAY), NOW)).toBe(0);
  });
});

// ============================================================
// toMarketItem
// ============================================================

describe("toMarketItem", () => {
  it("exposes per-second pricing only for video", () => {
    const items = catalog();
    const video = items.find((i) => i.type === "video")!;
    const article = items.find((i) => i.type === "article")!;

    expect(video.pricePerSecondUsdc).toBe(0.001);
    expect(video.durationSeconds).toBe(90);
    expect(video.coverImage).toBe("cover.png");

    expect(article.pricePerSecondUsdc).toBeNull();
    expect(article.durationSeconds).toBeNull();
  });

  it("flattens the populated creator", () => {
    const item = catalog()[0];
    expect(item.creator.username).toBe("superdemo");
    expect(item.creator.walletAddress).toBe("0x1");
    expect(item.id).toBe("art-1");
  });
});

// ============================================================
// applyFilters
// ============================================================

describe("applyFilters", () => {
  it("filters by type", () => {
    const out = applyFilters(catalog(), { type: "article" });
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("article");
  });

  it("filters by tag (case-insensitive)", () => {
    const out = applyFilters(catalog(), { tag: "ARC" });
    // article, video, api all carry the arc tag; file does not
    expect(out.map((i) => i.id).sort()).toEqual(["api-1", "art-1", "vid-1"]);
  });

  it("filters by price range inclusive", () => {
    const out = applyFilters(catalog(), { minPrice: 0.005, maxPrice: 0.05 });
    expect(out.map((i) => i.id).sort()).toEqual(["api-1", "art-1"]);
  });

  it("matches keyword across name, description, and creator handle", () => {
    expect(applyFilters(catalog(), { q: "lepton" }).map((i) => i.id)).toEqual(["vid-1"]);
    expect(applyFilters(catalog(), { q: "proof-of-flow" }).map((i) => i.id)).toEqual(["art-1"]);
    // creator handle match
    expect(applyFilters(catalog(), { q: "oracle co" }).map((i) => i.id)).toEqual(["api-1"]);
  });

  it("combines filters (tag + type)", () => {
    const out = applyFilters(catalog(), { tag: "streaming", type: "video" });
    expect(out.map((i) => i.id)).toEqual(["vid-1"]);
  });

  it("returns everything with no filters", () => {
    expect(applyFilters(catalog(), {})).toHaveLength(4);
  });
});

// ============================================================
// sortItems
// ============================================================

describe("sortItems", () => {
  it("trending: orders by descending trending score", () => {
    const out = sortItems(catalog(), "trending");
    const scores = out.map((i) => i.trendingScore);
    const sortedDesc = [...scores].sort((a, b) => b - a);
    expect(scores).toEqual(sortedDesc);
    // video (50 access + 2 rev*10 = 70) outranks the rest
    expect(out[0].id).toBe("vid-1");
  });

  it("newest: orders by descending createdAt", () => {
    const out = sortItems(catalog(), "newest");
    expect(out.map((i) => i.id)).toEqual(["art-1", "file-1", "vid-1", "api-1"]);
  });

  it("price_asc / price_desc", () => {
    expect(sortItems(catalog(), "price_asc").map((i) => i.priceUsdc)).toEqual([0, 0.005, 0.05, 0.25]);
    expect(sortItems(catalog(), "price_desc").map((i) => i.priceUsdc)).toEqual([0.25, 0.05, 0.005, 0]);
  });

  it("defaults to trending", () => {
    expect(sortItems(catalog())[0].id).toBe("vid-1");
  });

  it("does not mutate the input array", () => {
    const input = catalog();
    const before = input.map((i) => i.id);
    sortItems(input, "price_desc");
    expect(input.map((i) => i.id)).toEqual(before);
  });
});

// ============================================================
// computeFacets
// ============================================================

describe("computeFacets", () => {
  it("counts each type once over the full set", () => {
    const { types } = computeFacets(catalog());
    const map = Object.fromEntries(types.map((t) => [t.type, t.count]));
    expect(map).toEqual({ article: 1, video: 1, api: 1, file: 1 });
  });

  it("counts tags across resources and ranks by frequency", () => {
    const { tags } = computeFacets(catalog());
    const map = Object.fromEntries(tags.map((t) => [t.tag, t.count]));
    expect(map.arc).toBe(3);
    expect(map.streaming).toBe(2);
    expect(map.payments).toBe(1);
    expect(map.notes).toBe(1);
    // ranked: most frequent first
    expect(tags[0].tag).toBe("arc");
  });

  it("reflects the filtered set, not the whole catalog", () => {
    const filtered = applyFilters(catalog(), { type: "article" });
    const { types, tags } = computeFacets(filtered);
    expect(types).toEqual([{ type: "article", count: 1 }]);
    expect(Object.fromEntries(tags.map((t) => [t.tag, t.count]))).toEqual({
      payments: 1,
      arc: 1,
      streaming: 1,
    });
  });
});

// ============================================================
// relatedScore / rankRelated
// ============================================================

describe("relatedScore + rankRelated", () => {
  it("scores shared tags above category/creator overlap", () => {
    const items = catalog();
    const base = items[0]; // art-1: payments, arc, streaming
    const vid = items[1]; // vid-1: demo, streaming, arc (2 shared tags)
    const file = items[3]; // file-1: design, notes (0 shared)
    expect(relatedScore(base, vid)).toBeGreaterThan(relatedScore(base, file));
  });

  it("excludes the base item itself", () => {
    const items = catalog();
    expect(relatedScore(items[0], items[0])).toBe(-Infinity);
  });

  it("rankRelated drops zero-overlap items and orders by relevance", () => {
    const items = catalog();
    const base = items[0]; // payments, arc, streaming
    const related = rankRelated(base, items.slice(1), 6);
    expect(related[0].id).toBe("vid-1"); // 2 shared tags (streaming, arc)
    expect(related.map((r) => r.id)).not.toContain("art-1"); // not itself
    // file-1 shares no tags with base → dropped
    expect(related.map((r) => r.id)).not.toContain("file-1");
  });
});

// ============================================================
// toAgentCatalogItem
// ============================================================

describe("toAgentCatalogItem", () => {
  it("exposes a paymentUrl and the essentials for an agent", () => {
    const item = catalog()[0];
    const agentItem = toAgentCatalogItem(item);
    expect(agentItem.paymentUrl).toBe(`/x402/resource/${item.id}`);
    expect(agentItem.priceUsdc).toBe(item.priceUsdc);
    expect(agentItem.tags).toEqual(item.tags);
  });
});
