"use client";

/**
 * Settlement receipt shown after a streaming session closes: seconds
 * watched, what was paid, what came back, and the on-chain proof.
 */

import { getTxUrl } from "@/lib/chain-config";
import type { StreamSessionApi } from "@/hooks/use-stream-session";
import { CheckCircle2, ExternalLink } from "lucide-react";

function fmtUsdc(n: number, dp = 6): string {
  return n.toFixed(dp).replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1");
}

export function StreamReceipt({ session }: { session: StreamSessionApi }) {
  if (session.state !== "settled") return null;

  const refund = session.refundUsdc ?? Math.max(0, session.depositUsdc - session.spentUsdc);
  const paid = Math.max(0, session.depositUsdc - refund);

  return (
    <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <CheckCircle2 className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="font-bold text-foreground">Session settled</p>
          <p className="text-xs text-muted-foreground">
            You paid exactly for what you watched
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="p-3 rounded-xl bg-muted border border-border">
          <p className="text-xs text-muted-foreground">Seconds watched</p>
          <p className="font-mono font-bold text-foreground mt-0.5">{session.secondsWatched}s</p>
        </div>
        <div className="p-3 rounded-xl bg-muted border border-border">
          <p className="text-xs text-muted-foreground">Total paid</p>
          <p className="font-mono font-bold text-sp-gold mt-0.5">${fmtUsdc(paid)}</p>
        </div>
        <div className="p-3 rounded-xl bg-muted border border-border">
          <p className="text-xs text-muted-foreground">Deposit</p>
          <p className="font-mono font-bold text-foreground mt-0.5">${fmtUsdc(session.depositUsdc)}</p>
        </div>
        <div className="p-3 rounded-xl bg-muted border border-border">
          <p className="text-xs text-muted-foreground">Refunded</p>
          <p className="font-mono font-bold text-foreground mt-0.5">${fmtUsdc(refund)}</p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        {session.txHashOpen && (
          <a
            href={getTxUrl(session.txHashOpen)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            Channel opened <ExternalLink className="h-3 w-3" />
          </a>
        )}
        {session.txHashClose ? (
          <a
            href={getTxUrl(session.txHashClose)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            Channel settled <ExternalLink className="h-3 w-3" />
          </a>
        ) : (
          <p className="text-xs text-muted-foreground">
            No on-chain close was needed; your full deposit is reclaimable from the contract after 24h.
          </p>
        )}
      </div>
    </div>
  );
}
