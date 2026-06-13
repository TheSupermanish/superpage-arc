"use client";

import { TrendingUp } from "lucide-react";
import { ProductCard, type ProductCardItem } from "@/components/product-card";

interface TrendingRowProps {
  items: ProductCardItem[];
}

/**
 * "Trending now" strip shown above the grid when no search or filter is active.
 * Cards reuse the standard ProductCard with the Trending badge forced on, since
 * everything in this row is, by definition, trending.
 */
export function TrendingRow({ items }: TrendingRowProps) {
  if (items.length === 0) return null;

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <TrendingUp className="text-sp-gold" size={18} strokeWidth={2.4} />
        <h2 className="text-lg font-bold tracking-tight">Trending now</h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-6">
        {items.map((item) => (
          <ProductCard key={item.id} item={item} trending />
        ))}
      </div>
    </section>
  );
}
