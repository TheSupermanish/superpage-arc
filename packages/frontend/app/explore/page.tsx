"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, Search, ShoppingBag } from "lucide-react";
import { PublicNavbar } from "@/components/public-navbar";
import { ProductCard, type ProductCardItem } from "@/components/product-card";
import { PurchaseModal, type PurchaseItem } from "@/components/purchase-modal";
import { SearchBar } from "@/components/marketplace/search-bar";
import { TypeFacets, type FacetType, type TypeCounts } from "@/components/marketplace/type-facets";
import { TagNav, type TagFacet } from "@/components/marketplace/tag-nav";
import { SortSelect, type MarketSort } from "@/components/marketplace/sort-select";
import { CardSkeletonGrid } from "@/components/marketplace/card-skeleton";
import { TrendingRow } from "@/components/marketplace/trending-row";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const PAGE_SIZE = 24;
const TRENDING_COUNT = 6;

/** A catalog item as returned by GET /api/market/search. */
interface MarketItem {
  id: string;
  slug: string | null;
  type: "api" | "file" | "article" | "video";
  name: string;
  description: string | null;
  priceUsdc: number;
  pricePerSecondUsdc: number | null;
  durationSeconds: number | null;
  coverImage: string | null;
  tags: string[];
  accessCount: number;
  trendingScore: number;
  createdAt: string;
  creator: {
    username: string | null;
    displayName: string | null;
    name: string | null;
    avatarUrl: string | null;
    walletAddress: string | null;
  };
}

interface SearchResponse {
  items: MarketItem[];
  total: number;
  hasMore: boolean;
  facets: {
    types: Array<{ type: string; count: number }>;
    tags: TagFacet[];
  };
}

interface StoreProduct {
  id: string;
  storeId: string;
  name: string;
  description: string | null;
  image: string | null;
  price: string;
  currency: string;
  inventory: number | null;
}

function toCardItem(item: MarketItem): ProductCardItem {
  return {
    id: item.id,
    slug: item.slug,
    type: item.type,
    name: item.name,
    description: item.description,
    priceUsdc: item.priceUsdc,
    coverImage: item.coverImage,
    pricePerSecondUsdc: item.pricePerSecondUsdc,
    tags: item.tags,
    trendingScore: item.trendingScore,
    creator: {
      username: item.creator?.username,
      displayName: item.creator?.displayName,
      name: item.creator?.name,
    },
  };
}

export default function ExplorePage() {
  // Catalog query state
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<FacetType>("all");
  const [tag, setTag] = useState<string | null>(null);
  const [sort, setSort] = useState<MarketSort>("trending");

  // Results
  const [items, setItems] = useState<MarketItem[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  // Facets: derived from a type-agnostic query (q + tag, no type) so the type
  // pill counts and the "All" total stay stable when switching type.
  const [facetTotal, setFacetTotal] = useState(0);
  const [typeCounts, setTypeCounts] = useState<TypeCounts>({});
  const [tagFacets, setTagFacets] = useState<TagFacet[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);

  // Trending row (shown only when no search/filter is active)
  const [trending, setTrending] = useState<MarketItem[]>([]);

  // Shopify store products (kept in a separate section)
  const [storeProducts, setStoreProducts] = useState<StoreProduct[]>([]);

  const [purchaseItem, setPurchaseItem] = useState<PurchaseItem | null>(null);
  const [purchaseOpen, setPurchaseOpen] = useState(false);

  // Bumps to discard responses from stale (superseded) requests
  const requestSeq = useRef(0);

  const isBrowsing = !query && typeFilter === "all" && !tag;

  const buildSearchUrl = useCallback(
    (offset: number) => {
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      if (typeFilter !== "all") params.set("type", typeFilter);
      if (tag) params.set("tag", tag);
      params.set("sort", sort);
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(offset));
      return `${API_URL}/api/market/search?${params.toString()}`;
    },
    [query, typeFilter, tag, sort]
  );

  // Primary catalog fetch: reruns whenever a query input changes
  useEffect(() => {
    const seq = ++requestSeq.current;
    setLoading(true);
    setError(false);

    fetch(buildSearchUrl(0))
      .then((res) => {
        if (!res.ok) throw new Error(`search failed: ${res.status}`);
        return res.json() as Promise<SearchResponse>;
      })
      .then((data) => {
        if (seq !== requestSeq.current) return; // a newer request superseded us
        setItems(data.items || []);
        setTotal(data.total || 0);
        setHasMore(Boolean(data.hasMore));
      })
      .catch(() => {
        if (seq !== requestSeq.current) return;
        setItems([]);
        setTotal(0);
        setHasMore(false);
        setError(true);
      })
      .finally(() => {
        if (seq === requestSeq.current) setLoading(false);
      });
  }, [buildSearchUrl]);

  // Facet fetch: same q + tag context but no type filter, so the pills show how
  // many of each type match and the "All" count is the unfiltered-by-type total.
  useEffect(() => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (tag) params.set("tag", tag);
    params.set("limit", "1");
    params.set("offset", "0");
    const url = `${API_URL}/api/market/search?${params.toString()}`;

    let cancelled = false;
    fetch(url)
      .then((res) => (res.ok ? (res.json() as Promise<SearchResponse>) : null))
      .then((data) => {
        if (cancelled || !data) return;
        setFacetTotal(data.total || 0);
        const counts: TypeCounts = {};
        for (const t of data.facets?.types || []) counts[t.type] = t.count;
        setTypeCounts(counts);
        setTagFacets(data.facets?.tags || []);
      })
      .catch(() => {
        /* facets are best-effort; the grid still works */
      });

    return () => {
      cancelled = true;
    };
  }, [query, tag]);

  // Trending row + store products: fetched once on mount, independent of filters
  useEffect(() => {
    const trendingUrl = `${API_URL}/api/market/search?sort=trending&limit=${TRENDING_COUNT}&offset=0`;
    fetch(trendingUrl)
      .then((res) => (res.ok ? (res.json() as Promise<SearchResponse>) : null))
      .then((data) => {
        if (data?.items) setTrending(data.items);
      })
      .catch(() => {
        /* trending is best-effort: the grid still works without it */
      });

    fetch(`${API_URL}/x402/store-products?limit=8`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.products) setStoreProducts(data.products);
      })
      .catch(() => {
        /* store products are optional */
      });
  }, []);

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    const seq = requestSeq.current;
    setLoadingMore(true);
    try {
      const res = await fetch(buildSearchUrl(items.length));
      if (!res.ok) throw new Error(`load more failed: ${res.status}`);
      const data = (await res.json()) as SearchResponse;
      if (seq !== requestSeq.current) return; // filters changed mid-flight
      setItems((prev) => [...prev, ...(data.items || [])]);
      setHasMore(Boolean(data.hasMore));
    } catch {
      // Leave the existing items in place; the Load more button stays available
    } finally {
      setLoadingMore(false);
    }
  };

  const trendingCards = useMemo(() => trending.map(toCardItem), [trending]);
  const showTrendingRow = isBrowsing && !loading && trendingCards.length > 0;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PublicNavbar />

      {/* Header: playful gradient hero + search + controls */}
      <div className="relative overflow-hidden pt-32 pb-12">
        <div
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(55% 80% at 12% 0%, rgba(244,114,182,0.20), transparent 60%), radial-gradient(45% 70% at 88% 8%, rgba(59,158,255,0.18), transparent 60%), radial-gradient(60% 90% at 55% 100%, rgba(251,191,36,0.16), transparent 60%)",
          }}
        />
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col gap-8">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h1 className="text-4xl md:text-5xl font-black tracking-tight">
                  Explore the{" "}
                  <span className="bg-gradient-to-r from-sp-pink via-sp-coral to-sp-gold bg-clip-text text-transparent">
                    market
                  </span>{" "}
                  ✨
                </h1>
                <p className="text-muted-foreground mt-3 text-base md:text-lg">
                  Pay by the fraction — per article, per second, per call. Settled instantly in USDC. 🪙
                </p>
              </div>
              <Link
                href="/creators"
                className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-transform hover:-translate-y-0.5 hover:shadow-xl whitespace-nowrap"
              >
                Browse creators →
              </Link>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col lg:flex-row gap-4">
                <SearchBar value={query} onDebouncedChange={setQuery} />
                <div className="flex gap-3">
                  <TypeFacets active={typeFilter} counts={typeCounts} total={facetTotal} onChange={setTypeFilter} />
                  <SortSelect value={sort} onChange={setSort} />
                </div>
              </div>

              <TagNav tags={tagFacets} active={tag} onChange={setTag} />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-12 space-y-16">
        {/* Trending now: only when browsing the unfiltered catalog */}
        {showTrendingRow && <TrendingRow items={trendingCards} />}

        {/* Resource grid */}
        <section className="space-y-6">
          {!loading && !error && items.length > 0 && (
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold tracking-tight">
                {isBrowsing ? "All resources" : "Results"}
              </h2>
              <span className="text-sm text-muted-foreground">
                {total} {total === 1 ? "resource" : "resources"}
              </span>
            </div>
          )}

          {loading ? (
            <CardSkeletonGrid count={8} />
          ) : items.length === 0 ? (
            <div className="rounded-3xl border border-border bg-card p-16 text-center">
              <div className="size-16 rounded-full bg-muted flex items-center justify-center mb-4 mx-auto">
                <Search className="text-muted-foreground" size={28} />
              </div>
              <h3 className="text-lg font-bold mb-2">
                {error ? "Could not load the market" : "Nothing here yet"}
              </h3>
              <p className="text-muted-foreground text-sm">
                {error
                  ? "The catalog is unavailable right now. Try again in a moment."
                  : !isBrowsing
                    ? "Try a different search, type, or tag."
                    : "Be the first to publish something."}
              </p>
              {!isBrowsing && !error && (
                <button
                  onClick={() => {
                    setQuery("");
                    setTypeFilter("all");
                    setTag(null);
                  }}
                  className="mt-5 text-sm font-bold text-primary hover:underline"
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {items.map((item) => (
                  <ProductCard key={item.id} item={toCardItem(item)} />
                ))}
              </div>

              {hasMore && (
                <div className="flex justify-center pt-4">
                  <button
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-card border border-border text-sm font-bold hover:border-primary/40 disabled:opacity-60 transition-colors"
                  >
                    {loadingMore ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading
                      </>
                    ) : (
                      `Load more (${total - items.length} left)`
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        {/* Shopify store products: clearly separate section, browsing view only */}
        {isBrowsing && storeProducts.length > 0 && (
          <section className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Store products</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Physical and digital goods from connected Shopify stores
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {storeProducts.slice(0, 8).map((product) => (
                <div
                  key={product.id}
                  className="group flex flex-col rounded-2xl bg-card border border-border overflow-hidden transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/20"
                >
                  <div className="relative aspect-[4/3] bg-muted overflow-hidden">
                    {product.image ? (
                      <img
                        src={product.image}
                        alt={product.name}
                        className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <ShoppingBag className="h-12 w-12 text-muted-foreground/50" strokeWidth={1.5} />
                      </div>
                    )}
                    {product.inventory === 0 && (
                      <span className="absolute top-3 left-3 bg-red-500/90 text-white text-[10px] font-bold px-2.5 py-1 rounded-full">
                        Sold out
                      </span>
                    )}
                  </div>
                  <div className="p-4 flex flex-col gap-3 flex-1">
                    <h3 className="font-bold text-sm leading-snug line-clamp-2 flex-1">{product.name}</h3>
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-1 rounded-lg bg-muted border border-border text-sm font-bold font-mono">
                        ${parseFloat(product.price).toFixed(2)}
                      </span>
                      <button
                        onClick={() => {
                          setPurchaseItem({ kind: "product", data: product });
                          setPurchaseOpen(true);
                        }}
                        disabled={product.inventory === 0}
                        className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Buy
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <PurchaseModal
        open={purchaseOpen}
        onOpenChange={(open) => {
          setPurchaseOpen(open);
          if (!open) setPurchaseItem(null);
        }}
        item={purchaseItem}
      />
    </div>
  );
}
