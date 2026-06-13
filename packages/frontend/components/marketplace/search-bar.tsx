"use client";

import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";

interface SearchBarProps {
  /** Current committed query (debounced value flows up via onDebouncedChange). */
  value: string;
  onDebouncedChange: (value: string) => void;
  placeholder?: string;
  /** Debounce window in ms. */
  delay?: number;
}

/**
 * Search input that debounces keystrokes before hitting the catalog API.
 * Keeps its own immediate text state so typing stays responsive, and only
 * pushes the trimmed value up after the user pauses.
 */
export function SearchBar({
  value,
  onDebouncedChange,
  placeholder = "Search resources or creators",
  delay = 300,
}: SearchBarProps) {
  const [text, setText] = useState(value);

  // Keep local text in sync if the parent resets the query (e.g. clear filters)
  useEffect(() => {
    setText(value);
  }, [value]);

  useEffect(() => {
    const trimmed = text.trim();
    if (trimmed === value) return;
    const timer = setTimeout(() => onDebouncedChange(trimmed), delay);
    return () => clearTimeout(timer);
  }, [text, value, delay, onDebouncedChange]);

  return (
    <div className="relative flex-1">
      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
      <input
        type="text"
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="w-full bg-card border border-border focus:border-primary focus:ring-4 focus:ring-primary/10 rounded-2xl py-3.5 pl-12 pr-10 text-sm font-medium transition-all outline-none"
      />
      {text && (
        <button
          type="button"
          onClick={() => {
            setText("");
            onDebouncedChange("");
          }}
          aria-label="Clear search"
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
