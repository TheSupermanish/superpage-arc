"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { PublicNavbar } from "@/components/public-navbar";
import { useX402Payment, type PaymentStatus } from "@/hooks/use-x402-payment";
import { getTxUrl } from "@/lib/chain-config";
import { ChainSelector } from "@/components/chain-selector";
import {
  Loader2,
  Lock,
  Wallet,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Clock,
} from "lucide-react";

const ArticleRenderer = dynamic(() => import("@/components/editor/article-renderer"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  ),
});

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface ArticlePreview {
  slug: string;
  type: string;
  name: string;
  description: string | null;
  excerpt?: string;
  coverImage?: string | null;
  priceUsdc: number;
  currency: string;
  freeBlocks?: number;
  previewBlocks?: any[] | null;
  previewMarkdown?: string | null;
  totalBlocks?: number | null;
  readingMinutes?: number;
  creator?: { username: string | null; displayName: string | null };
}

interface FullArticle {
  blocks: any[] | null;
  markdown: string;
}

const STATUS_LABELS: Record<PaymentStatus, string> = {
  idle: "",
  "fetching-requirements": "Preparing payment...",
  "switching-network": "Switching network...",
  "awaiting-approval": "Approve the transaction in your wallet",
  "confirming-tx": "Confirming transaction...",
  "verifying-payment": "Verifying payment...",
  success: "Unlocked!",
  error: "Payment failed",
};

export default function ReadArticlePage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug;

  const { isConnected, address } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { payForResource, status, error, txHash, reset } = useX402Payment();

  const [preview, setPreview] = useState<ArticlePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [unlocked, setUnlocked] = useState<FullArticle | null>(null);
  const [alreadyOwned, setAlreadyOwned] = useState(false);

  const isProcessing = status !== "idle" && status !== "success" && status !== "error";

  // Load the free preview
  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/x402/resource/${slug}/preview`);
        if (!res.ok) {
          if (!cancelled) setNotFound(true);
          return;
        }
        const data = await res.json();
        if (!cancelled) setPreview(data);
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  // If this wallet already bought the article, phase-1 returns 200 with the
  // full content instead of 402: skip the paywall entirely
  useEffect(() => {
    if (!slug || !address || unlocked) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/x402/resource/${slug}?wallet=${address.toLowerCase()}`);
        if (res.status !== 200) return;
        const data = await res.json();
        if (cancelled || !data) return;
        if (data.blocks || data.markdown || data.content) {
          setUnlocked({ blocks: data.blocks ?? null, markdown: data.markdown ?? data.content ?? "" });
          setAlreadyOwned(true);
        }
      } catch {
        // Silent: the paywall stays up and the buy flow still works
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, address]);

  const handleUnlock = async () => {
    if (!isConnected) {
      openConnectModal?.();
      return;
    }
    try {
      const result = await payForResource(slug);
      const data = result.content as any;
      setUnlocked({
        blocks: data?.blocks ?? null,
        markdown: data?.markdown ?? data?.content ?? "",
      });
    } catch {
      // Error state is handled by the hook
    }
  };

  // ── Loading / not found ──
  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <PublicNavbar />
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (notFound || !preview) {
    return (
      <div className="min-h-screen bg-background">
        <PublicNavbar />
        <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-6 text-center">
          <h1 className="text-2xl font-bold text-foreground font-display">Article not found</h1>
          <p className="text-muted-foreground text-sm">
            This article does not exist or is no longer available.
          </p>
          <Link
            href="/explore"
            className="text-primary hover:underline font-medium text-sm"
          >
            Explore the marketplace
          </Link>
        </div>
      </div>
    );
  }

  const username = preview.creator?.username;
  const byline = preview.creator?.displayName || username || "Anonymous";

  return (
    <div className="min-h-screen bg-background">
      <PublicNavbar />

      <main className="pt-28 pb-24 px-6">
        <article className="mx-auto w-full max-w-[68ch]">
          {/* Cover */}
          {preview.coverImage && (
            <img
              src={preview.coverImage}
              alt={preview.name}
              className="w-full aspect-[2/1] object-cover rounded-2xl border border-border mb-10"
            />
          )}

          {/* Title + byline */}
          <header className="mb-10">
            <h1 className="font-display text-4xl md:text-5xl font-bold text-foreground leading-tight tracking-tight">
              {preview.name}
            </h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-5 text-sm text-muted-foreground">
              {username ? (
                <Link
                  href={`/@${username}`}
                  className="text-primary hover:underline font-medium"
                >
                  @{username}
                </Link>
              ) : (
                <span className="font-medium text-foreground">{byline}</span>
              )}
              {preview.readingMinutes !== undefined && (
                <>
                  <span aria-hidden>·</span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {preview.readingMinutes} min read
                  </span>
                </>
              )}
              {!unlocked && (
                <>
                  <span aria-hidden>·</span>
                  <span>
                    {preview.priceUsdc} {preview.currency}
                  </span>
                </>
              )}
            </div>
          </header>

          {/* Body */}
          <div className="text-lg">
            {unlocked ? (
              <>
                <ArticleRenderer
                  key="full"
                  blocks={unlocked.blocks}
                  markdown={unlocked.markdown}
                />
                {/* Receipt line */}
                <div className="mt-12 pt-6 border-t border-border flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                  {alreadyOwned && !txHash ? (
                    <span>Unlocked with a previous purchase from this wallet</span>
                  ) : (
                    <span>
                      Paid {preview.priceUsdc} {preview.currency} to @{username || byline}
                    </span>
                  )}
                  {txHash && (
                    <a
                      href={getTxUrl(txHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      View receipt on Arcscan <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </>
            ) : (
              <>
                {/* Free preview with a gradient fade into the paywall */}
                <div className="relative">
                  <ArticleRenderer
                    key="preview"
                    blocks={preview.previewBlocks}
                    markdown={preview.previewMarkdown}
                  />
                  <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-background via-background/80 to-transparent pointer-events-none" />
                </div>

                {/* Paywall card */}
                <div className="relative -mt-8 bg-card border border-border rounded-2xl p-8 text-center space-y-5 shadow-xl">
                  <div className="size-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
                    <Lock className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-foreground font-display">
                      Unlock the full article
                    </h2>
                    <p className="text-sm text-muted-foreground mt-2">
                      Pay once with {preview.currency}, read forever. Works for humans and AI agents.
                    </p>
                  </div>
                  <p className="text-3xl font-bold text-primary">
                    {preview.priceUsdc}{" "}
                    <span className="text-base font-medium text-muted-foreground">
                      {preview.currency}
                    </span>
                  </p>

                  {/* Pay-on-chain selector (multichain) */}
                  {!isProcessing && (
                    <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                      <span>Pay on</span>
                      <ChainSelector />
                    </div>
                  )}

                  {/* Payment progress */}
                  {isProcessing && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-center gap-2 text-sm text-foreground">
                        {status === "awaiting-approval" ? (
                          <Wallet className="h-4 w-4 text-primary animate-pulse" />
                        ) : (
                          <Loader2 className="h-4 w-4 text-primary animate-spin" />
                        )}
                        {STATUS_LABELS[status]}
                      </div>
                      {txHash && (
                        <a
                          href={getTxUrl(txHash)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          View transaction <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  )}

                  {/* Error */}
                  {status === "error" && error && (
                    <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-2 text-left">
                      <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                      <p className="text-sm text-red-400">{error}</p>
                    </div>
                  )}

                  {!isProcessing && (
                    <button
                      type="button"
                      onClick={status === "error" ? () => { reset(); handleUnlock(); } : handleUnlock}
                      className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-primary text-primary-foreground font-bold hover:bg-primary/90 transition-colors shadow-lg shadow-primary/10 inline-flex items-center justify-center gap-2"
                    >
                      {!isConnected ? (
                        <>
                          <Wallet className="h-4 w-4" />
                          Connect wallet to unlock
                        </>
                      ) : status === "error" ? (
                        "Try again"
                      ) : (
                        <>
                          <Lock className="h-4 w-4" />
                          Unlock for {preview.priceUsdc} {preview.currency}
                        </>
                      )}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </article>
      </main>
    </div>
  );
}
