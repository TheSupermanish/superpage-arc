"use client";

/**
 * Settlement receipt shown after a streaming session closes: the confirmation
 * moment. Seconds watched, what was paid, what came back, what the creator
 * earned, and the on-chain proof (Arcscan links for the open and close tx).
 */

import type { StreamSessionApi } from "@/hooks/use-stream-session";
import { CheckCircle2, ExternalLink, ArrowRight } from "lucide-react";

const ARCSCAN_BASE = "https://testnet.arcscan.app";
function arcTxUrl(hash: string): string {
  return `${ARCSCAN_BASE}/tx/${hash}`;
}

function fmtUsdc(n: number, dp = 6): string {
  return n.toFixed(dp).replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1");
}

function fmtDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}

export function StreamReceipt({ session }: { session: StreamSessionApi }) {
  if (session.state !== "settled") return null;

  const refund = session.refundUsdc ?? Math.max(0, session.depositUsdc - session.spentUsdc);
  const paid = Math.max(0, session.depositUsdc - refund);
  // The contract forwards the full owed amount to the creator (no protocol cut
  // on the streaming channel), so creator earnings equal what the viewer paid.
  const creatorPaid = paid;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-emerald-400/20 bg-card p-6">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 70% at 50% 0%, rgba(52,211,153,0.10), transparent 55%)",
        }}
      />
      <div className="relative">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-emerald-400/15">
            <CheckCircle2 className="h-6 w-6 text-emerald-400" />
          </div>
          <div>
            <p className="font-display text-lg font-bold text-foreground">Session settled</p>
            <p className="text-xs text-muted-foreground">
              You watched {fmtDuration(session.secondsWatched)} and paid exactly for it
            </p>
          </div>
        </div>

        {/* Headline split: total paid -> refunded */}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-sp-gold/20 bg-sp-gold/5 p-4">
            <p className="text-xs text-muted-foreground">Total paid</p>
            <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-sp-gold">
              ${fmtUsdc(paid)}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-muted p-4">
            <p className="text-xs text-muted-foreground">Refunded to you</p>
            <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-foreground">
              ${fmtUsdc(refund)}
            </p>
          </div>
        </div>

        {/* Breakdown */}
        <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
          <div className="rounded-xl border border-border bg-muted p-3">
            <p className="text-xs text-muted-foreground">Seconds watched</p>
            <p className="mt-0.5 font-mono font-bold tabular-nums text-foreground">
              {Math.floor(session.secondsWatched)}s
            </p>
          </div>
          <div className="rounded-xl border border-border bg-muted p-3">
            <p className="text-xs text-muted-foreground">Deposit</p>
            <p className="mt-0.5 font-mono font-bold tabular-nums text-foreground">
              ${fmtUsdc(session.depositUsdc)}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-muted p-3">
            <p className="text-xs text-muted-foreground">Creator earned</p>
            <p className="mt-0.5 font-mono font-bold tabular-nums text-foreground">
              ${fmtUsdc(creatorPaid)}
            </p>
          </div>
        </div>

        {/* On-chain proof */}
        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-4">
          <span className="text-xs font-medium text-muted-foreground">On-chain proof</span>
          {session.txHashOpen && (
            <a
              href={arcTxUrl(session.txHashOpen)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-sp-blue hover:underline"
            >
              Channel opened <ExternalLink className="h-3 w-3" />
            </a>
          )}
          {session.txHashClose ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <ArrowRight className="h-3 w-3" />
              <a
                href={arcTxUrl(session.txHashClose)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sp-blue hover:underline"
              >
                Channel settled <ExternalLink className="h-3 w-3" />
              </a>
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">
              No on-chain close was needed; your full deposit is reclaimable from the
              contract after 24h.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
