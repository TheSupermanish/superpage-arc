"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Code,
  FileText,
  Newspaper,
  Play,
  ShoppingBag,
  Check,
  Zap,
  Undo2,
  ShieldCheck,
  Loader2,
  ExternalLink,
  Download,
  BookOpen,
  type LucideIcon,
} from "lucide-react";
import { PublicNavbar } from "@/components/public-navbar";
import { PurchaseModal, type PurchaseItem } from "@/components/purchase-modal";
import { getAddressUrl, getCurrency } from "@/lib/chain-config";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface ResourceMeta {
  slug: string;
  type: "api" | "file" | "article" | "video" | "shopify";
  name: string;
  description: string | null;
  priceUsdc: number;
  currency: string;
  coverImage: string | null;
  createdAt: string;
  accessCount: number;
  creator: {
    username: string | null;
    displayName: string;
    walletAddress: string | null;
  };
  video?: {
    pricePerSecondUsdc: number;
    durationSeconds: number;
    freePreviewSeconds: number;
  };
  article?: {
    excerpt: string;
    freeBlocks: number;
    readingMinutes: number;
  };
}

const TYPE_STYLES: Record<string, { icon: LucideIcon; label: string; text: string; tint: string }> = {
  api: { icon: Code, label: "API", text: "text-sp-blue", tint: "bg-sp-blue/10" },
  file: { icon: FileText, label: "File", text: "text-sp-gold", tint: "bg-sp-gold/10" },
  article: { icon: Newspaper, label: "Article", text: "text-sp-coral", tint: "bg-sp-coral/10" },
  video: { icon: Play, label: "Video", text: "text-sp-pink", tint: "bg-sp-pink/10" },
  shopify: { icon: ShoppingBag, label: "Store", text: "text-sp-cream", tint: "bg-sp-cream/10" },
};

function resolveCoverUrl(src: string): string {
  return src.startsWith("/") ? `${API_URL}${src}` : src;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins === 0) return `${secs}s`;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins} min`;
}

function whatYouGet(meta: ResourceMeta): string[] {
  switch (meta.type) {
    case "video":
      return [
        `Stream the full video (${formatDuration(meta.video?.durationSeconds || 0)})`,
        `First ${meta.video?.freePreviewSeconds ?? 10} seconds free, no wallet needed`,
        "Pay only for the seconds you actually watch",
        "Stop anytime, the unused deposit comes back to you",
      ];
    case "article":
      return [
        `Full article, about ${meta.article?.readingMinutes ?? 1} min of reading`,
        meta.article?.freeBlocks
          ? `${meta.article.freeBlocks} preview block${meta.article.freeBlocks === 1 ? "" : "s"} free before you pay`
          : "Free preview before you pay",
        "One payment, read instantly in your browser",
      ];
    case "file":
      return [
        "Direct download right after payment",
        "The original file, exactly as the creator uploaded it",
        "Yours to keep, no account required",
      ];
    case "api":
      return [
        "Instant access to the live endpoint",
        "Pay per call over plain HTTP (x402)",
        "Works the same for humans and AI agents",
      ];
    default:
      return [
        "Instant access after payment",
        "Sold directly by the creator",
      ];
  }
}

export default function ProductPage() {
  const params = useParams();
  const slug = params.slug as string;

  const [meta, setMeta] = useState<ResourceMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [purchaseItem, setPurchaseItem] = useState<PurchaseItem | null>(null);
  const [purchaseOpen, setPurchaseOpen] = useState(false);

  useEffect(() => {
    if (!slug) return;
    const fetchMeta = async () => {
      try {
        const res = await fetch(`${API_URL}/api/resources/${slug}/meta`);
        if (!res.ok) {
          setNotFound(true);
          return;
        }
        const json = await res.json();
        setMeta(json.data ?? json);
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    };
    fetchMeta();
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <PublicNavbar />
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (notFound || !meta) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <PublicNavbar />
        <div className="flex flex-col items-center justify-center min-h-screen px-6 text-center">
          <h1 className="text-5xl font-bold mb-3">404</h1>
          <p className="text-muted-foreground mb-8">
            This product does not exist or is no longer for sale.
          </p>
          <Link
            href="/explore"
            className="px-6 py-3 rounded-full bg-primary text-primary-foreground font-bold hover:bg-primary/90 transition-colors"
          >
            Browse the market
          </Link>
        </div>
      </div>
    );
  }

  const style = TYPE_STYLES[meta.type] || TYPE_STYLES.api;
  const TypeIcon = style.icon;
  const currency = meta.currency || getCurrency();
  const bullets = whatYouGet(meta);

  const ratePerMin = meta.video ? meta.video.pricePerSecondUsdc * 60 : 0;
  const fullWatchCost = meta.video
    ? meta.video.pricePerSecondUsdc * meta.video.durationSeconds
    : 0;

  const openPurchase = () => {
    setPurchaseItem({
      kind: "resource",
      data: {
        id: meta.slug,
        slug: meta.slug,
        type: meta.type as "api" | "file" | "article" | "shopify",
        name: meta.name,
        description: meta.description,
        priceUsdc: meta.priceUsdc,
        accessCount: meta.accessCount,
        creator: {
          name: meta.creator.displayName,
          username: meta.creator.username || undefined,
        },
      },
    });
    setPurchaseOpen(true);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PublicNavbar />

      <main className="max-w-6xl mx-auto px-6 pt-28 pb-20">
        <div className="grid lg:grid-cols-[1fr_380px] gap-10">
          {/* Left column: cover + details */}
          <div className="space-y-8 min-w-0">
            {/* Cover */}
            <div className={`relative aspect-video rounded-3xl overflow-hidden border border-border ${style.tint}`}>
              {meta.coverImage ? (
                <img
                  src={resolveCoverUrl(meta.coverImage)}
                  alt={meta.name}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <TypeIcon className={`h-24 w-24 ${style.text} opacity-50`} strokeWidth={1.25} />
                </div>
              )}
              <span className="absolute top-4 left-4 px-3 py-1.5 rounded-full bg-background/80 backdrop-blur text-xs font-bold uppercase tracking-wider border border-border">
                {style.label}
              </span>
            </div>

            {/* Title + description */}
            <div className="space-y-4">
              <h1 className="text-3xl md:text-4xl font-bold leading-tight">{meta.name}</h1>
              {meta.description && (
                <p className="text-lg text-muted-foreground leading-relaxed">{meta.description}</p>
              )}
              {meta.type === "article" && meta.article?.excerpt && (
                <p className="text-base text-muted-foreground leading-relaxed border-l-2 border-sp-coral/40 pl-4 italic">
                  {meta.article.excerpt}
                </p>
              )}
            </div>

            {/* What you get */}
            <div className="rounded-2xl border border-border bg-card p-6">
              <h2 className="font-bold text-lg mb-4">What you get</h2>
              <ul className="space-y-3">
                {bullets.map((line) => (
                  <li key={line} className="flex items-start gap-3 text-sm text-muted-foreground">
                    <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Creator strip */}
            <div className="rounded-2xl border border-border bg-card p-5 flex items-center gap-4">
              <div className="size-12 rounded-full bg-primary/15 text-primary flex items-center justify-center font-bold text-lg shrink-0">
                {(meta.creator.displayName || "?").charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold truncate">{meta.creator.displayName}</p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {meta.creator.username && (
                    <Link href={`/${meta.creator.username}`} className="text-primary hover:underline font-medium">
                      @{meta.creator.username}
                    </Link>
                  )}
                  {meta.creator.walletAddress && (
                    <a
                      href={getAddressUrl(meta.creator.walletAddress)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono hover:text-foreground transition-colors inline-flex items-center gap-1"
                    >
                      {meta.creator.walletAddress.slice(0, 6)}...{meta.creator.walletAddress.slice(-4)}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
              <span className="text-xs text-muted-foreground shrink-0">
                {meta.accessCount} {meta.accessCount === 1 ? "sale" : "sales"}
              </span>
            </div>
          </div>

          {/* Right column: sticky buy box */}
          <aside className="lg:sticky lg:top-28 h-fit">
            <div className="rounded-3xl border border-border bg-card p-6 space-y-5">
              {/* Price */}
              {meta.type === "video" && meta.video ? (
                <div>
                  <p className="text-4xl font-bold font-mono">
                    ${ratePerMin.toFixed(2)}
                    <span className="text-lg text-muted-foreground font-sans font-medium">/min</span>
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    About ${fullWatchCost.toFixed(2)} {currency} to watch all{" "}
                    {formatDuration(meta.video.durationSeconds)}
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-4xl font-bold font-mono">${meta.priceUsdc.toFixed(2)}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    One-time payment in {currency}
                  </p>
                </div>
              )}

              {/* CTA per type */}
              {meta.type === "video" ? (
                <Link
                  href={`/watch/${meta.slug}`}
                  className="flex items-center justify-center gap-2 w-full py-4 rounded-2xl bg-primary text-primary-foreground font-bold text-base hover:bg-primary/90 transition-colors shadow-lg shadow-primary/10"
                >
                  <Play className="h-5 w-5" />
                  Watch now, pay per second
                </Link>
              ) : meta.type === "article" ? (
                <Link
                  href={`/read/${meta.slug}`}
                  className="flex items-center justify-center gap-2 w-full py-4 rounded-2xl bg-primary text-primary-foreground font-bold text-base hover:bg-primary/90 transition-colors shadow-lg shadow-primary/10"
                >
                  <BookOpen className="h-5 w-5" />
                  Start reading
                </Link>
              ) : (
                <button
                  onClick={openPurchase}
                  className="flex items-center justify-center gap-2 w-full py-4 rounded-2xl bg-primary text-primary-foreground font-bold text-base hover:bg-primary/90 transition-colors shadow-lg shadow-primary/10"
                >
                  {meta.type === "file" ? (
                    <>
                      <Download className="h-5 w-5" />
                      Buy and download
                    </>
                  ) : (
                    <>
                      <Zap className="h-5 w-5" />
                      Buy access
                    </>
                  )}
                </button>
              )}

              {/* Trust row */}
              <div className="pt-4 border-t border-border space-y-2.5">
                <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
                  <ShieldCheck className="h-4 w-4 text-sp-blue shrink-0" />
                  Settled in {currency} on Arc
                </div>
                <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
                  <Zap className="h-4 w-4 text-sp-gold shrink-0" />
                  Instant, fees under a cent
                </div>
                <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
                  <Undo2 className="h-4 w-4 text-sp-pink shrink-0" />
                  Refundable stream deposits
                </div>
              </div>
            </div>
          </aside>
        </div>
      </main>

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
