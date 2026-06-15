"use client";

import { useEffect, useState } from "react";
import { Star, ShieldCheck } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface ReputationView {
  registered: boolean;
  agentId: number | null;
  count: number;
  score: number | null;
  tags: string[];
}

/**
 * On-chain ERC-8004 reputation badge. Reads from /api/reputation; renders
 * nothing until it confirms the creator has an on-chain identity, then shows
 * either a review summary (once feedback exists) or a "Verified on Arc" chip.
 */
export function ReputationBadge({
  username,
  agentId,
  className = "",
}: {
  username?: string;
  agentId?: number;
  className?: string;
}) {
  const [rep, setRep] = useState<ReputationView | null>(null);

  useEffect(() => {
    const url = username
      ? `${API_URL}/api/reputation/by-creator/${username}`
      : agentId
        ? `${API_URL}/api/reputation/agent/${agentId}`
        : null;
    if (!url) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) return;
        const data = (await res.json()) as ReputationView;
        if (!cancelled) setRep(data);
      } catch {
        /* badge stays hidden on error */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [username, agentId]);

  if (!rep || !rep.registered) return null;

  const hasReviews = rep.count > 0;
  const explorer = "https://testnet.arcscan.app";

  return (
    <a
      href={`${explorer}/address/0x92b19730d0b7416f195600489cd9be29e109ebce`}
      target="_blank"
      rel="noreferrer"
      title={
        hasReviews
          ? `${rep.count} on-chain ${rep.count === 1 ? "review" : "reviews"}${rep.tags.length ? ` · ${rep.tags.join(", ")}` : ""}`
          : "On-chain identity verified on Arc (ERC-8004). No reviews yet."
      }
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold transition-colors ${
        hasReviews
          ? "bg-sp-gold/10 border-sp-gold/30 text-sp-gold hover:bg-sp-gold/20"
          : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
      } ${className}`}
    >
      {hasReviews ? (
        <>
          <Star className="h-3.5 w-3.5 fill-current" />
          {rep.score != null ? `${rep.score}` : "rated"}
          <span className="opacity-70">
            · {rep.count} {rep.count === 1 ? "review" : "reviews"}
          </span>
        </>
      ) : (
        <>
          <ShieldCheck className="h-3.5 w-3.5" />
          Verified on Arc
        </>
      )}
    </a>
  );
}
