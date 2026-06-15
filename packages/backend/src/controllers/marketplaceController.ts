import { Request, Response } from "express";
import { Resource } from "../models/index.js";
import { asyncHandler } from "../middleware/errorHandler.js";

/**
 * Marketplace catalog/search backend.
 *
 * Serves both the website (explore/search UI) and AI agents discovering
 * resources programmatically. The pure helpers below (computeTrendingScore,
 * applyFilters, sortItems, computeFacets) hold all the ranking/filter logic so
 * they can be unit-tested without a live database (see marketplace.test.ts).
 */

export type MarketplaceType = "article" | "video" | "file" | "api";
export type MarketplaceSort = "trending" | "newest" | "price_asc" | "price_desc";

/** Shape returned to clients for each catalog item (the frontend contract). */
export interface MarketItem {
  id: string;
  slug: string | null;
  type: string;
  name: string;
  description: string | null;
  priceUsdc: number;
  pricePerSecondUsdc: number | null;
  durationSeconds: number | null;
  coverImage: string | null;
  tags: string[];
  category: string | null;
  accessCount: number;
  trendingScore: number;
  createdAt: Date | string;
  creator: {
    id: string | null;
    username: string | null;
    displayName: string | null;
    name: string | null;
    avatarUrl: string | null;
    walletAddress: string | null;
    agentId: number | null;
  };
}

/** Filters a normalized item must satisfy to appear in results. */
export interface MarketFilters {
  q?: string;
  type?: string;
  tag?: string;
  minPrice?: number;
  maxPrice?: number;
}

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 60;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Trending score for ranking.
 *
 *   trendingScore = accessCount + totalRevenue*10 + recencyBoost
 *
 * where recencyBoost = max(0, 14 - ageDays). Revenue is weighted 10x so a
 * single sale outranks a handful of free views, and the recency term gives
 * brand-new resources a mild head start that decays to zero after two weeks.
 */
export function computeTrendingScore(
  accessCount: number,
  totalRevenue: number,
  createdAt: Date | string | number,
  now: number = Date.now()
): number {
  const created = new Date(createdAt).getTime();
  const ageDays = Number.isFinite(created) ? (now - created) / MS_PER_DAY : 0;
  const recencyBoost = Math.max(0, 14 - ageDays);
  return (accessCount || 0) + (totalRevenue || 0) * 10 + recencyBoost;
}

/**
 * Normalize a raw (lean) Resource doc with populated creator into a MarketItem.
 * Video pricing fields come from config; everything else is null for non-video.
 */
export function toMarketItem(r: any, now: number = Date.now()): MarketItem {
  const config: Record<string, any> = r.config || {};
  const creator: any = r.creatorId || {};
  const isVideo = r.type === "video";
  return {
    id: r._id?.toString?.() ?? String(r._id ?? r.id ?? ""),
    slug: r.slug ?? null,
    type: r.type,
    name: r.name,
    description: r.description ?? null,
    priceUsdc: r.priceUsdc,
    pricePerSecondUsdc: isVideo ? config.pricePerSecondUsdc ?? null : null,
    durationSeconds: isVideo ? config.durationSeconds ?? null : null,
    coverImage: config.coverImage || null,
    tags: Array.isArray(r.tags) ? r.tags : [],
    category: r.category ?? null,
    accessCount: r.accessCount || 0,
    trendingScore: computeTrendingScore(r.accessCount, r.totalRevenue, r.createdAt, now),
    createdAt: r.createdAt,
    creator: {
      id: creator._id?.toString?.() ?? (creator._id ? String(creator._id) : null),
      username: creator.username ?? null,
      displayName: creator.displayName ?? null,
      name: creator.name ?? null,
      avatarUrl: creator.avatarUrl ?? null,
      walletAddress: creator.walletAddress ?? null,
      agentId: typeof creator.erc8004AgentId === "number" ? creator.erc8004AgentId : null,
    },
  };
}

/**
 * Apply keyword/type/tag/price filters in memory. Keyword matches name,
 * description, or the creator handle (username/displayName/name).
 */
export function applyFilters(items: MarketItem[], filters: MarketFilters): MarketItem[] {
  const q = filters.q?.trim().toLowerCase();
  const tag = filters.tag?.trim().toLowerCase();
  const type = filters.type?.trim().toLowerCase();

  return items.filter((item) => {
    if (type && item.type !== type) return false;
    if (tag && !item.tags.includes(tag)) return false;
    if (typeof filters.minPrice === "number" && item.priceUsdc < filters.minPrice) return false;
    if (typeof filters.maxPrice === "number" && item.priceUsdc > filters.maxPrice) return false;
    if (q) {
      const haystack = [
        item.name,
        item.description ?? "",
        item.creator.username ?? "",
        item.creator.displayName ?? "",
        item.creator.name ?? "",
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

/** Sort a copy of items by the requested order (default trending desc). */
export function sortItems(items: MarketItem[], sort: MarketplaceSort = "trending"): MarketItem[] {
  const out = [...items];
  switch (sort) {
    case "newest":
      out.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      break;
    case "price_asc":
      out.sort((a, b) => a.priceUsdc - b.priceUsdc);
      break;
    case "price_desc":
      out.sort((a, b) => b.priceUsdc - a.priceUsdc);
      break;
    case "trending":
    default:
      out.sort((a, b) => b.trendingScore - a.trendingScore);
      break;
  }
  return out;
}

/**
 * Count types and tags across the full filtered set (before pagination) so the
 * UI can show "Articles (12)" style counts and a category nav.
 */
export function computeFacets(items: MarketItem[]): {
  types: Array<{ type: string; count: number }>;
  tags: Array<{ tag: string; count: number }>;
} {
  const typeCounts = new Map<string, number>();
  const tagCounts = new Map<string, number>();

  for (const item of items) {
    typeCounts.set(item.type, (typeCounts.get(item.type) || 0) + 1);
    for (const tag of item.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
  }

  const types = [...typeCounts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
  const tags = [...tagCounts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));

  return { types, tags };
}

/**
 * Relevance of `candidate` to `base` for "more like this": shared tags dominate
 * (8 each), same category adds a bump (5), same creator a small one (3), and
 * trendingScore breaks ties (scaled down so it never outweighs a tag match).
 */
export function relatedScore(base: MarketItem, candidate: MarketItem): number {
  if (candidate.id === base.id) return -Infinity;
  const baseTags = new Set(base.tags);
  const sharedTags = candidate.tags.filter((t) => baseTags.has(t)).length;
  let relevance = sharedTags * 8;
  if (candidate.category && candidate.category === base.category) relevance += 5;
  if (candidate.creator.id && candidate.creator.id === base.creator.id) relevance += 3;
  // No tag/category/creator overlap → not related, regardless of how trending it
  // is. Only once there's real relevance does trendingScore break ties (<=1).
  if (relevance <= 0) return 0;
  return relevance + Math.min(candidate.trendingScore, 50) / 50;
}

/** Rank candidates by relevance to base, dropping zero-overlap items. */
export function rankRelated(base: MarketItem, candidates: MarketItem[], limit = 6): MarketItem[] {
  return candidates
    .map((c) => ({ c, s: relatedScore(base, c) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.c);
}

/**
 * Compact, machine-readable view of a catalog item for agents: just what's
 * needed to decide and pay. paymentUrl is the x402 endpoint to hit.
 */
export interface AgentCatalogItem {
  id: string;
  slug: string | null;
  type: string;
  name: string;
  description: string | null;
  priceUsdc: number;
  tags: string[];
  category: string | null;
  paymentUrl: string;
  /** Enough to leave on-chain feedback after buying, if the creator is an agent. */
  creator: { username: string | null; agentId: number | null };
}

export function toAgentCatalogItem(item: MarketItem): AgentCatalogItem {
  return {
    id: item.id,
    slug: item.slug,
    type: item.type,
    name: item.name,
    description: item.description,
    priceUsdc: item.priceUsdc,
    tags: item.tags,
    category: item.category,
    paymentUrl: `/x402/resource/${item.id}`,
    creator: { username: item.creator.username, agentId: item.creator.agentId },
  };
}

function parseSort(raw: unknown): MarketplaceSort {
  const allowed: MarketplaceSort[] = ["trending", "newest", "price_asc", "price_desc"];
  return allowed.includes(raw as MarketplaceSort) ? (raw as MarketplaceSort) : "trending";
}

function parseNumber(raw: unknown): number | undefined {
  if (raw === undefined || raw === null || raw === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * GET /api/market/search
 * Catalog search used by both the website and AI agents.
 */
export const searchMarketplace = asyncHandler(async (req: Request, res: Response) => {
  const { q, type, tag, minPrice, maxPrice, sort } = req.query;

  const limit = Math.min(Math.max(parseInt(req.query.limit as string) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);

  const filters: MarketFilters = {
    q: typeof q === "string" ? q : undefined,
    type: typeof type === "string" ? type : undefined,
    tag: typeof tag === "string" ? tag : undefined,
    minPrice: parseNumber(minPrice),
    maxPrice: parseNumber(maxPrice),
  };

  // Pull the candidate set from Mongo (only active + public), then do the
  // keyword/tag/price filtering and ranking in memory. The catalog is small
  // enough that this keeps the search/facet contract identical to the unit
  // tests, and keyword search spans the populated creator handle.
  const raw = await Resource.find({ isActive: true, isPublic: true })
    .populate("creatorId", "username displayName name avatarUrl walletAddress erc8004AgentId")
    .lean();

  const now = Date.now();
  const normalized = raw.map((r: any) => toMarketItem(r, now));
  const filtered = applyFilters(normalized, filters);
  const sorted = sortItems(filtered, parseSort(sort));

  // Facets are computed over the full filtered set, before pagination.
  const facets = computeFacets(filtered);

  const page = sorted.slice(offset, offset + limit);

  return res.json({
    items: page,
    total: filtered.length,
    hasMore: offset + page.length < filtered.length,
    facets,
  });
});

/**
 * GET /api/market/tags
 * Top tags across public/active resources, for the category nav.
 */
export const listMarketplaceTags = asyncHandler(async (_req: Request, res: Response) => {
  const rows = await Resource.aggregate([
    { $match: { isActive: true, isPublic: true } },
    { $unwind: "$tags" },
    { $group: { _id: "$tags", count: { $sum: 1 } } },
    { $sort: { count: -1, _id: 1 } },
    { $project: { _id: 0, tag: "$_id", count: 1 } },
  ]);

  return res.json({ tags: rows });
});

/**
 * GET /api/market/related/:id
 * "More like this" — resources sharing tags/category with the given resource.
 */
export const relatedMarketplace = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 6, 1), 12);

  const raw = await Resource.find({ isActive: true, isPublic: true })
    .populate("creatorId", "username displayName name avatarUrl walletAddress erc8004AgentId")
    .lean();

  const now = Date.now();
  const all = raw.map((r: any) => toMarketItem(r, now));
  const base = all.find((it) => it.id === id || it.slug === id);
  if (!base) return res.status(404).json({ error: "Resource not found" });

  const related = rankRelated(base, all.filter((it) => it.id !== base.id), limit);
  return res.json({ items: related, total: related.length });
});

/**
 * GET /api/market/discover
 * Agent-facing discovery: a compact, machine-readable catalog with a paymentUrl
 * per item, plus intent filters (q, type, tag, maxPrice). Sorted by trending so
 * an autonomous buyer can pick high-signal items first. This is the endpoint the
 * buyer agent loop consumes.
 */
export const discoverMarketplace = asyncHandler(async (req: Request, res: Response) => {
  const { q, type, tag, maxPrice, sort } = req.query;
  const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 12, 1), MAX_LIMIT);

  const filters: MarketFilters = {
    q: typeof q === "string" ? q : undefined,
    type: typeof type === "string" ? type : undefined,
    tag: typeof tag === "string" ? tag : undefined,
    maxPrice: parseNumber(maxPrice),
  };

  const raw = await Resource.find({ isActive: true, isPublic: true })
    .populate("creatorId", "username displayName name avatarUrl walletAddress erc8004AgentId")
    .lean();

  const now = Date.now();
  const normalized = raw.map((r: any) => toMarketItem(r, now));
  const filtered = applyFilters(normalized, filters);
  const sorted = sortItems(filtered, parseSort(sort)).slice(0, limit);

  return res.json({
    items: sorted.map(toAgentCatalogItem),
    total: filtered.length,
    facets: computeFacets(filtered),
    note: "Pay any item by POSTing an X-PAYMENT proof to its paymentUrl (x402). chainId in the 402 accepts[] is authoritative.",
  });
});
