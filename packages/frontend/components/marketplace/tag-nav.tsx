"use client";

import { Hash } from "lucide-react";

export interface TagFacet {
  tag: string;
  count: number;
}

interface TagNavProps {
  tags: TagFacet[];
  /** Currently selected tag, or null when none is active. */
  active: string | null;
  onChange: (tag: string | null) => void;
  /** Cap on how many tag chips to render. */
  limit?: number;
}

/**
 * Horizontal tag navigation. Clicking the active tag again clears it. Stays
 * hidden when there are no tags so empty catalogs degrade cleanly.
 */
export function TagNav({ tags, active, onChange, limit = 16 }: TagNavProps) {
  if (tags.length === 0) return null;
  const shown = tags.slice(0, limit);

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1">
      <span className="flex items-center gap-1 text-xs font-bold text-muted-foreground shrink-0">
        <Hash size={13} />
        Tags
      </span>
      {shown.map(({ tag, count }) => {
        const isActive = active === tag;
        return (
          <button
            key={tag}
            onClick={() => onChange(isActive ? null : tag)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              isActive
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
            }`}
          >
            {tag}
            <span className="ml-1.5 opacity-60">{count}</span>
          </button>
        );
      })}
    </div>
  );
}
