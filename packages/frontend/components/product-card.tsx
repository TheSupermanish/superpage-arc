"use client";

import Link from "next/link";
import { Code, FileText, Newspaper, Play, ShoppingBag, type LucideIcon } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export type ProductCardType = "api" | "file" | "article" | "video" | "shopify";

export interface ProductCardItem {
  id: string;
  slug?: string | null;
  type: ProductCardType;
  name: string;
  description?: string | null;
  priceUsdc: number;
  coverImage?: string | null;
  /** Video only: per-second rate, shown as $/min */
  pricePerSecondUsdc?: number | null;
  creator?: {
    username?: string | null;
    displayName?: string | null;
    name?: string | null;
  } | null;
}

const TYPE_STYLES: Record<
  ProductCardType,
  { icon: LucideIcon; label: string; text: string; tint: string; chip: string }
> = {
  api: { icon: Code, label: "API", text: "text-sp-blue", tint: "bg-sp-blue/10", chip: "bg-sp-blue/15 text-sp-blue" },
  file: { icon: FileText, label: "File", text: "text-sp-gold", tint: "bg-sp-gold/10", chip: "bg-sp-gold/15 text-sp-gold" },
  article: { icon: Newspaper, label: "Article", text: "text-sp-coral", tint: "bg-sp-coral/10", chip: "bg-sp-coral/15 text-sp-coral" },
  video: { icon: Play, label: "Video", text: "text-sp-pink", tint: "bg-sp-pink/10", chip: "bg-sp-pink/15 text-sp-pink" },
  shopify: { icon: ShoppingBag, label: "Store", text: "text-sp-cream", tint: "bg-sp-cream/10", chip: "bg-sp-cream/15 text-sp-cream" },
};

/** Cover images may be stored as backend-relative paths (e.g. /uploads/...) */
function resolveCoverUrl(src: string): string {
  return src.startsWith("/") ? `${API_URL}${src}` : src;
}

/** Sub-cent prices are the whole point of nanopayments: never collapse them to $0.00. */
function formatUsdc(amount: number): string {
  if (amount > 0 && amount < 0.01) {
    return `$${amount.toFixed(4).replace(/0+$/, "").replace(/\.$/, "")}`;
  }
  return `$${amount.toFixed(2)}`;
}

export function formatCardPrice(item: Pick<ProductCardItem, "type" | "priceUsdc" | "pricePerSecondUsdc">): string {
  if (item.type === "video" && item.pricePerSecondUsdc) {
    return `${formatUsdc(item.pricePerSecondUsdc * 60)}/min`;
  }
  const price = item.priceUsdc ?? 0;
  if (price === 0) return "Free";
  return formatUsdc(price);
}

export function ProductCard({ item }: { item: ProductCardItem }) {
  const style = TYPE_STYLES[item.type] || TYPE_STYLES.api;
  const Icon = style.icon;
  const creatorHandle = item.creator?.username
    ? `@${item.creator.username}`
    : item.creator?.displayName || item.creator?.name || null;

  return (
    <Link
      href={`/r/${item.slug || item.id}`}
      className="group flex flex-col rounded-2xl bg-card border border-border overflow-hidden transition-all duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/20 hover:border-foreground/20"
    >
      {/* Cover, consistent 4:3 */}
      <div className={`relative aspect-[4/3] overflow-hidden ${style.tint}`}>
        {item.coverImage ? (
          <img
            src={resolveCoverUrl(item.coverImage)}
            alt={item.name}
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Icon className={`h-14 w-14 ${style.text} opacity-60`} strokeWidth={1.5} />
          </div>
        )}
        <span
          className={`absolute top-3 left-3 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider backdrop-blur ${style.chip}`}
        >
          {style.label}
        </span>
      </div>

      {/* Body */}
      <div className="flex flex-col gap-1.5 p-4 flex-1">
        <h3 className="font-bold text-base leading-snug line-clamp-2 group-hover:text-primary transition-colors">
          {item.name}
        </h3>
        {creatorHandle && (
          <p className="text-xs text-muted-foreground truncate">{creatorHandle}</p>
        )}
        <div className="mt-auto pt-3 flex items-center justify-between">
          <span className="px-2.5 py-1 rounded-lg bg-muted border border-border text-sm font-bold font-mono">
            {formatCardPrice(item)}
          </span>
          {item.type === "video" && item.pricePerSecondUsdc ? (
            <span className="text-[11px] text-muted-foreground">pay per second</span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
