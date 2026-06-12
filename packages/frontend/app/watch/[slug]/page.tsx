"use client";

/**
 * Pay-per-second watch page: free preview, then an on-chain StreamPay
 * channel meters playback while an ephemeral session key signs vouchers.
 */

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PublicNavbar } from "@/components/public-navbar";
import { StreamPlayer } from "@/components/stream/stream-player";
import { StreamReceipt } from "@/components/stream/stream-receipt";
import { useStreamSession } from "@/hooks/use-stream-session";
import { Loader2, Video, Clock, Zap } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface StreamMeta {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  pricePerSecondUsdc: number;
  durationSeconds: number;
  freePreviewSeconds: number;
  coverImage: string | null;
  transcodeStatus: string;
  creator: {
    walletAddress: string | null;
    username: string | null;
    name: string | null;
    avatarUrl: string | null;
  };
}

function fmtUsdc(n: number, dp = 6): string {
  return n.toFixed(dp).replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1");
}

function fmtDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default function WatchPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);

  const [meta, setMeta] = useState<StreamMeta | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Shared playback probe: the player flips it, the session hook samples it
  const isPlayingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/stream/meta/${slug}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error || "Video not found");
        }
        const body = await res.json();
        if (!cancelled) setMeta(body);
      } catch (err: any) {
        if (!cancelled) setError(err.message || "Failed to load video");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const session = useStreamSession({
    resourceSlug: slug,
    creatorWallet: meta?.creator.walletAddress || null,
    pricePerSecondUsdc: meta?.pricePerSecondUsdc || 0,
    isPlaying: () => isPlayingRef.current,
  });

  const creatorLabel = meta?.creator.username
    ? `@${meta.creator.username}`
    : meta?.creator.name ||
      (meta?.creator.walletAddress
        ? `${meta.creator.walletAddress.slice(0, 6)}...${meta.creator.walletAddress.slice(-4)}`
        : "Unknown creator");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PublicNavbar />

      <main className="max-w-5xl mx-auto px-4 pt-28 pb-8 space-y-6">
        {error && (
          <div className="p-6 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        {!meta && !error && (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
          </div>
        )}

        {meta && meta.transcodeStatus !== "ready" && (
          <div className="p-6 rounded-2xl bg-card border border-border flex items-center gap-3">
            <Loader2 className="h-5 w-5 text-sp-gold animate-spin" />
            <p className="text-sm text-muted-foreground">
              This video is still processing. Check back in a moment.
            </p>
          </div>
        )}

        {meta && meta.transcodeStatus === "ready" && (
          <>
            <StreamPlayer
              resourceId={meta.id}
              slug={meta.slug}
              pricePerSecondUsdc={meta.pricePerSecondUsdc}
              durationSeconds={meta.durationSeconds}
              freePreviewSeconds={meta.freePreviewSeconds}
              coverImage={meta.coverImage}
              session={session}
              isPlayingRef={isPlayingRef}
            />

            <StreamReceipt session={session} />

            <div className="space-y-3">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <h1 className="text-2xl font-bold text-foreground">{meta.name}</h1>
                  <p className="text-sm text-muted-foreground mt-1">
                    by{" "}
                    {meta.creator.username ? (
                      <Link href={`/${meta.creator.username}`} className="text-sp-gold hover:underline">
                        {creatorLabel}
                      </Link>
                    ) : (
                      creatorLabel
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-sp-gold/10 text-sp-gold font-medium">
                    <Zap className="h-3 w-3" />
                    ${fmtUsdc(meta.pricePerSecondUsdc)}/sec
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted text-muted-foreground font-medium">
                    <Clock className="h-3 w-3" />
                    {fmtDuration(meta.durationSeconds)}
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted text-muted-foreground font-medium">
                    <Video className="h-3 w-3" />
                    {meta.freePreviewSeconds}s free preview
                  </span>
                </div>
              </div>

              {meta.description && (
                <p className="text-sm text-muted-foreground leading-relaxed max-w-3xl">
                  {meta.description}
                </p>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
