"use client";

import { ArrowUpDown } from "lucide-react";

export type MarketSort = "trending" | "newest" | "price_asc" | "price_desc";

const OPTIONS: Array<{ value: MarketSort; label: string }> = [
  { value: "trending", label: "Trending" },
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
];

interface SortSelectProps {
  value: MarketSort;
  onChange: (value: MarketSort) => void;
}

/**
 * Sort dropdown for the catalog. Native select, styled to match the API form's
 * select so the marketplace UI stays consistent with the rest of the app.
 */
export function SortSelect({ value, onChange }: SortSelectProps) {
  return (
    <div className="relative shrink-0">
      <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" size={15} />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as MarketSort)}
        aria-label="Sort resources"
        className="appearance-none bg-card border border-border focus:border-primary rounded-2xl py-3 pl-9 pr-9 text-sm font-bold text-foreground outline-none cursor-pointer transition-colors"
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <svg
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
      >
        <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
