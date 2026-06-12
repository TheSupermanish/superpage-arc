"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search, ShoppingBag, Loader2 } from "lucide-react";
import { PublicNavbar } from "@/components/public-navbar";
import { ProductCard, type ProductCardItem } from "@/components/product-card";
import { PurchaseModal, type PurchaseItem } from "@/components/purchase-modal";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface Resource {
  id: string;
  slug: string;
  type: "api" | "file" | "article" | "video" | "shopify";
  name: string;
  description: string | null;
  priceUsdc: number;
  coverImage?: string | null;
  pricePerSecondUsdc?: number | null;
  accessCount: number;
  createdAt: string;
  creator: {
    id: string;
    walletAddress: string;
    name: string;
    username?: string;
    avatarUrl?: string;
  };
}

interface Creator {
  id: string;
  username: string;
  displayName?: string;
  name: string;
  avatarUrl?: string;
  bio?: string;
  totalSales: number;
  resourceCount: number;
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

const TYPE_FILTERS: Array<{ value: string; label: string }> = [
  { value: "all", label: "All" },
  { value: "article", label: "Articles" },
  { value: "video", label: "Videos" },
  { value: "file", label: "Files" },
  { value: "api", label: "APIs" },
];

export default function ExplorePage() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [creators, setCreators] = useState<Creator[]>([]);
  const [storeProducts, setStoreProducts] = useState<StoreProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [purchaseItem, setPurchaseItem] = useState<PurchaseItem | null>(null);
  const [purchaseOpen, setPurchaseOpen] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Combined explore endpoint
        const exploreRes = await fetch(`${API_URL}/api/explore?limit=50`);

        if (exploreRes.ok) {
          const data = await exploreRes.json();
          if (data.success && data.data) {
            setResources(data.data.resources || []);
            setCreators(data.data.creators || []);
            setStoreProducts(data.data.products || []);
          }
        } else {
          // Fallback to individual endpoints if combined endpoint fails
          const [resourcesRes, creatorsRes, productsRes] = await Promise.all([
            fetch(`${API_URL}/x402/resources?limit=50`),
            fetch(`${API_URL}/api/creators?limit=20&sortBy=sales`),
            fetch(`${API_URL}/x402/store-products?limit=30`),
          ]);

          if (resourcesRes.ok) {
            const data = await resourcesRes.json();
            setResources(data.resources || []);
          }
          if (creatorsRes.ok) {
            const data = await creatorsRes.json();
            setCreators(data.creators || data.data || []);
          }
          if (productsRes.ok) {
            const data = await productsRes.json();
            setStoreProducts(data.products || []);
          }
        }
      } catch (err) {
        console.error("Failed to fetch data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const searchLower = search.toLowerCase();

  // Newest first, then filter by search + type pill
  const filteredResources = useMemo(() => {
    return [...resources]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .filter((r) => {
        const matchesSearch = search
          ? r.name.toLowerCase().includes(searchLower) ||
            r.description?.toLowerCase().includes(searchLower) ||
            r.creator?.name?.toLowerCase().includes(searchLower) ||
            r.creator?.username?.toLowerCase().includes(searchLower)
          : true;
        const matchesType = typeFilter === "all" || r.type === typeFilter;
        return matchesSearch && matchesType;
      });
  }, [resources, search, searchLower, typeFilter]);

  const filteredProducts = storeProducts.filter((p) => {
    if (typeFilter !== "all") return false;
    if (!search) return true;
    return (
      p.name?.toLowerCase().includes(searchLower) ||
      p.description?.toLowerCase().includes(searchLower)
    );
  });

  const toCardItem = (r: Resource): ProductCardItem => ({
    id: r.id,
    slug: r.slug,
    type: r.type,
    name: r.name,
    description: r.description,
    priceUsdc: r.priceUsdc,
    coverImage: r.coverImage,
    pricePerSecondUsdc: r.pricePerSecondUsdc,
    creator: { username: r.creator?.username, name: r.creator?.name },
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PublicNavbar />

      {/* Header: search + filters */}
      <div className="border-b border-border pt-32 pb-10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col gap-8">
            <div className="flex items-end justify-between gap-4">
              <div>
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Explore the market</h1>
                <p className="text-muted-foreground mt-2">
                  Videos, articles, files, and APIs. Pay per use, settled in USDC.
                </p>
              </div>
              <Link
                href="/creators"
                className="hidden sm:block text-sm font-bold text-primary hover:underline whitespace-nowrap"
              >
                Browse creators
              </Link>
            </div>

            <div className="flex flex-col md:flex-row gap-4">
              {/* Search */}
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
                <input
                  type="text"
                  placeholder="Search products or creators"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-card border border-border focus:border-primary focus:ring-4 focus:ring-primary/10 rounded-2xl py-3.5 pl-12 pr-4 text-sm font-medium transition-all outline-none"
                />
              </div>

              {/* Type pills */}
              <div className="flex gap-1.5 bg-card p-1.5 rounded-2xl border border-border w-fit overflow-x-auto">
                {TYPE_FILTERS.map((f) => (
                  <button
                    key={f.value}
                    onClick={() => setTypeFilter(f.value)}
                    className={`px-5 py-2 text-xs font-bold rounded-xl transition-all whitespace-nowrap ${
                      typeFilter === f.value
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-12 space-y-16">
        {/* Product grid */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filteredResources.length === 0 ? (
          <div className="rounded-3xl border border-border bg-card p-16 text-center">
            <div className="size-16 rounded-full bg-muted flex items-center justify-center mb-4 mx-auto">
              <Search className="text-muted-foreground" size={28} />
            </div>
            <h3 className="text-lg font-bold mb-2">Nothing here yet</h3>
            <p className="text-muted-foreground text-sm">
              {search || typeFilter !== "all"
                ? "Try a different search or filter."
                : "Be the first to publish something."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredResources.map((resource) => (
              <ProductCard key={resource.id} item={toCardItem(resource)} />
            ))}
          </div>
        )}

        {/* Creators strip */}
        {!loading && creators.length > 0 && (
          <section className="space-y-4">
            <h2 className="text-lg font-bold tracking-tight">Creators</h2>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {creators.slice(0, 10).map((creator) => (
                <Link
                  key={creator.id}
                  href={creator.username ? `/${creator.username}` : `/creators/${creator.id}`}
                  className="flex items-center gap-3 px-4 py-2.5 rounded-full bg-card border border-border hover:border-primary/40 transition-colors shrink-0"
                >
                  <div
                    className="size-7 rounded-full bg-cover bg-center bg-primary/15"
                    style={
                      creator.avatarUrl
                        ? { backgroundImage: `url(${creator.avatarUrl})` }
                        : undefined
                    }
                  />
                  <span className="text-sm font-medium whitespace-nowrap">
                    {creator.displayName || creator.name}
                  </span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {creator.resourceCount} items
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Shopify store products */}
        {!loading && filteredProducts.length > 0 && (
          <section className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Store products</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Physical and digital goods from connected Shopify stores
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredProducts.slice(0, 8).map((product) => (
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
