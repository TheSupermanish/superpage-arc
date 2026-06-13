"use client";

import { Code, FileText, Layers, Newspaper, Play, type LucideIcon } from "lucide-react";

export type FacetType = "all" | "article" | "video" | "file" | "api";

/** Per-type facet counts from the search response (facets.types). */
export type TypeCounts = Record<string, number>;

const FACETS: Array<{ value: FacetType; label: string; icon: LucideIcon }> = [
  { value: "all", label: "All", icon: Layers },
  { value: "article", label: "Articles", icon: Newspaper },
  { value: "video", label: "Videos", icon: Play },
  { value: "file", label: "Files", icon: FileText },
  { value: "api", label: "APIs", icon: Code },
];

interface TypeFacetsProps {
  active: FacetType;
  counts: TypeCounts;
  /** Total across all types, for the "All" pill count. */
  total: number;
  onChange: (value: FacetType) => void;
}

/**
 * Type filter pills (All / Articles / Videos / Files / APIs) with live counts
 * pulled from the search facets. Counts stay visible even at zero so the row
 * doesn't reflow as filters change.
 */
export function TypeFacets({ active, counts, total, onChange }: TypeFacetsProps) {
  return (
    <div className="flex gap-1.5 bg-card p-1.5 rounded-2xl border border-border w-fit overflow-x-auto">
      {FACETS.map((f) => {
        const count = f.value === "all" ? total : counts[f.value] ?? 0;
        const isActive = active === f.value;
        return (
          <button
            key={f.value}
            onClick={() => onChange(f.value)}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl transition-all whitespace-nowrap ${
              isActive
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <f.icon size={14} strokeWidth={2.2} />
            {f.label}
            <span className={isActive ? "opacity-80" : "opacity-60"}>{count}</span>
          </button>
        );
      })}
    </div>
  );
}
