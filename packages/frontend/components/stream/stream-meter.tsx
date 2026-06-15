"use client";

/**
 * Live pay-per-second HUD: the showpiece of the watch page.
 *
 * A large USDC spend counter ticks up in real time while the video plays,
 * interpolated between the hook's per-second heartbeats with requestAnimation-
 * Frame for buttery motion. The displayed value is purely cosmetic: what is
 * actually owed and signed lives in use-stream-session.ts and is never touched
 * here. When playback pauses, the counter visibly freezes ("meter paused").
 *
 * Also surfaces: the rate ($/sec and $/min), a deposit gauge that drains in
 * sp-gold as spend approaches the deposit, a per-second pulse, animated state
 * chips, and on-chain Arcscan links for the open/close transactions.
 */

import { useEffect, useRef, useState } from "react";
import type { StreamSessionApi } from "@/hooks/use-stream-session";
import { Square, Loader2, ExternalLink, Zap, Pause, CheckCircle2 } from "lucide-react";

// Streaming is Arc-only, so the proof links always point at Arcscan regardless
// of whichever pay chain the rest of the app has selected.
const ARCSCAN_BASE = "https://testnet.arcscan.app";
function arcTxUrl(hash: string): string {
  return `${ARCSCAN_BASE}/tx/${hash}`;
}

function fmtUsdc(n: number, dp = 6): string {
  return n.toFixed(dp);
}

function fmtClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toString().padStart(2, "0")}`;
}

type MeterPhase = "preview" | "streaming" | "paused" | "settling" | "settled";

function phaseFrom(session: StreamSessionApi): MeterPhase {
  if (session.state === "settled") return "settled";
  if (session.state === "settling") return "settling";
  if (session.state === "active") return session.isMetering ? "streaming" : "paused";
  return "preview";
}

const CHIPS: Record<MeterPhase, { label: string; dot: string; text: string; bg: string }> = {
  preview: { label: "Free preview", dot: "bg-white/50", text: "text-white/70", bg: "bg-white/10" },
  streaming: { label: "Streaming", dot: "bg-sp-gold", text: "text-sp-gold", bg: "bg-sp-gold/15" },
  paused: { label: "Meter paused", dot: "bg-white/60", text: "text-white/80", bg: "bg-white/10" },
  settling: { label: "Settling on-chain", dot: "bg-sp-blue", text: "text-sp-blue", bg: "bg-sp-blue/15" },
  settled: { label: "Settled", dot: "bg-emerald-400", text: "text-emerald-300", bg: "bg-emerald-400/15" },
};

export function StreamMeter({
  session,
  pricePerSecondUsdc,
  active,
  onStop,
  variant = "panel",
}: {
  session: StreamSessionApi;
  pricePerSecondUsdc: number;
  /** True once a channel is open (streaming/settling/settled): show the live HUD. */
  active: boolean;
  onStop: () => void;
  /** "overlay" = compact glass HUD that floats over the video; "panel" = full card. */
  variant?: "panel" | "overlay";
}) {
  const phase = phaseFrom(session);
  const chip = CHIPS[phase];

  const deposit = session.depositUsdc || 0;
  const rate = pricePerSecondUsdc;
  const ratePerMin = rate * 60;

  // ── Smooth interpolated spend (cosmetic) ─────────────────────────────
  // displaySpend eases up between the integer-second heartbeats. We project
  // forward at most one extra second of accrual past the authoritative
  // secondsWatched, resetting the fractional clock whenever it advances, so
  // the number always rolls up and never overshoots what is actually owed.
  const [displaySpend, setDisplaySpend] = useState(0);
  const secondsRef = useRef(session.secondsWatched);
  const meteringRef = useRef(session.isMetering);
  const fracStartRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);

  secondsRef.current = session.secondsWatched;
  meteringRef.current = session.isMetering;

  // Reset the fractional clock whenever the integer second advances (or the
  // metering state flips), so interpolation re-anchors to the latest tick.
  useEffect(() => {
    fracStartRef.current = performance.now();
  }, [session.secondsWatched, session.isMetering]);

  useEffect(() => {
    if (session.state === "settled" || session.state === "settling") {
      // Freeze on the authoritative settled spend.
      setDisplaySpend(Math.min(session.spentUsdc, deposit || session.spentUsdc));
      return;
    }
    if (!active) {
      setDisplaySpend(0);
      return;
    }
    const loop = () => {
      const base = secondsRef.current;
      let secs = base;
      if (meteringRef.current) {
        const frac = Math.min(1, (performance.now() - fracStartRef.current) / 1000);
        secs = base + frac;
      }
      let spend = secs * rate;
      if (deposit > 0) spend = Math.min(spend, deposit);
      setDisplaySpend(spend);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, rate, deposit, session.state, session.spentUsdc]);

  // ── Per-second pulse: a 1s heartbeat driven by the wall clock, only while
  // money is actually flowing. Used to flash the counter and the dot. ──
  const [pulseKey, setPulseKey] = useState(0);
  useEffect(() => {
    if (phase !== "streaming") return;
    const id = setInterval(() => setPulseKey((k) => k + 1), 1000);
    return () => clearInterval(id);
  }, [phase]);

  // ── Deposit gauge geometry (an arc that drains as spend approaches deposit)
  const pct = deposit > 0 ? Math.min(1, displaySpend / deposit) : 0;
  const R = 52;
  const CIRC = Math.PI * R; // semicircle arc length
  const dashOffset = CIRC * (1 - pct);
  const remaining = Math.max(0, deposit - displaySpend);

  if (!active) return null;

  // Split into "major" (whole + first 2 decimals) and the fast micro digits
  // (last 4 decimals) so the eye reads a stable price while the tail races.
  const spendStr = fmtUsdc(displaySpend); // e.g. "0.012345"
  const [intPart, decPart = ""] = spendStr.split(".");
  const majorDec = decPart.slice(0, 2).padEnd(2, "0");
  const microDec = decPart.slice(2).padEnd(4, "0");

  // Compact glass HUD that floats over the video (theater layout). Same live
  // numbers as the full panel, just the essentials: state, spend, rate, stop.
  if (variant === "overlay") {
    return (
      <div className="w-52 rounded-xl border border-white/10 bg-black/70 p-3 shadow-xl shadow-black/50 backdrop-blur-md">
        <div className="flex items-center justify-between gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium ${chip.bg} ${chip.text}`}
          >
            <span className="relative flex h-1.5 w-1.5">
              {phase === "streaming" && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sp-gold opacity-60" />
              )}
              <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${chip.dot}`} />
            </span>
            {chip.label}
          </span>
          <span className="font-mono text-[10px] tabular-nums text-white/45">${fmtUsdc(rate, 6)}/s</span>
        </div>

        <div
          key={phase === "streaming" ? pulseKey : "frozen"}
          className={`mt-2 flex items-baseline font-mono font-bold tabular-nums leading-none ${
            phase === "streaming" ? "text-sp-gold sp-tick" : "text-white/60"
          }`}
        >
          <style>{`@keyframes sp-tick{0%{transform:scale(1)}40%{transform:scale(1.06)}100%{transform:scale(1)}}.sp-tick{animation:sp-tick 320ms ease-out}@media (prefers-reduced-motion:reduce){.sp-tick{animation:none!important}}`}</style>
          <span className="mr-0.5 text-sm">$</span>
          <span className="text-2xl tracking-tight">
            {intPart}.{majorDec}
          </span>
          <span className={`text-sm ${phase === "streaming" ? "text-sp-gold/55" : "text-white/30"}`}>
            {microDec}
          </span>
        </div>
        <div className="mt-0.5 text-[10px] text-white/40">
          paid so far · {fmtClock(session.secondsWatched)} watched
        </div>

        {session.state === "active" && (
          <button
            type="button"
            onClick={onStop}
            className="mt-2.5 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-red-500/20 px-2 py-1.5 text-[11px] font-medium text-red-300 transition-colors hover:bg-red-500/30"
          >
            <Square className="h-3 w-3" /> Stop &amp; settle
          </button>
        )}
        {session.state === "settling" && (
          <div className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] text-white/60">
            <Loader2 className="h-3 w-3 animate-spin" /> settling…
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-white/10 bg-zinc-950">
      {/* Scoped keyframes: flowing money sheen + per-second tick */}
      <style>{`
        @keyframes sp-flow {
          0% { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
        .sp-flow-bar {
          background-image: linear-gradient(90deg,
            transparent 0%, rgba(229,186,115,0.0) 20%,
            rgba(229,186,115,0.55) 50%, rgba(229,186,115,0.0) 80%, transparent 100%);
          background-size: 50% 100%;
          animation: sp-flow 1.6s linear infinite;
        }
        @keyframes sp-tick {
          0% { transform: scale(1); }
          40% { transform: scale(1.06); }
          100% { transform: scale(1); }
        }
        .sp-tick { animation: sp-tick 320ms ease-out; }
        @media (prefers-reduced-motion: reduce) {
          .sp-tick, .sp-flow-bar { animation: none !important; }
        }
      `}</style>

      {/* Soft gold field that intensifies while money flows */}
      <div
        className={`pointer-events-none absolute inset-0 transition-opacity duration-700 ${
          phase === "streaming" ? "opacity-100" : "opacity-0"
        }`}
        style={{
          background:
            "radial-gradient(120% 80% at 50% 0%, rgba(229,186,115,0.16), transparent 60%)",
        }}
      />
      {/* Flow strip along the very top edge, animated only while streaming */}
      <div className="absolute inset-x-0 top-0 h-0.5 bg-white/5">
        <div className={`h-full ${phase === "streaming" ? "sp-flow-bar" : ""}`} />
      </div>

      <div className="relative p-5 sm:p-6">
        {/* Header: state chip + live rate */}
        <div className="flex items-center justify-between gap-3">
          <span
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium transition-colors duration-300 ${chip.bg} ${chip.text}`}
          >
            <span className="relative flex h-2 w-2">
              {phase === "streaming" && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sp-gold opacity-60" />
              )}
              <span className={`relative inline-flex h-2 w-2 rounded-full ${chip.dot}`} />
            </span>
            {chip.label}
          </span>

          <div className="text-right font-mono">
            <div className="flex items-center justify-end gap-1.5 text-sm font-semibold text-white tabular-nums">
              <Zap className="h-3.5 w-3.5 text-sp-gold" />${fmtUsdc(rate, 6)}
              <span className="text-white/40">/sec</span>
            </div>
            <div className="text-[11px] text-white/40 tabular-nums">
              ≈ ${fmtUsdc(ratePerMin, 4)}/min
            </div>
          </div>
        </div>

        {/* Hero: the spend odometer */}
        <div className="mt-5 flex flex-col items-center text-center">
          <p className="text-[11px] uppercase tracking-[0.2em] text-white/40">
            Paid so far
          </p>
          <div
            key={phase === "streaming" ? pulseKey : "frozen"}
            className={`mt-1 flex items-baseline font-mono font-bold tabular-nums leading-none ${
              phase === "streaming" ? "text-sp-gold sp-tick" : "text-white/55"
            }`}
          >
            <span className="text-2xl sm:text-3xl mr-0.5 self-start mt-1">$</span>
            <span className="text-5xl sm:text-6xl tracking-tight">
              {intPart}.{majorDec}
            </span>
            <span
              className={`text-2xl sm:text-3xl tracking-tight ${
                phase === "streaming" ? "text-sp-gold/55" : "text-white/30"
              }`}
            >
              {microDec}
            </span>
            <span className="ml-2 text-xs font-sans font-medium text-white/40 self-end mb-1.5">
              USDC
            </span>
          </div>

          <p className="mt-2 text-xs text-white/50">
            {phase === "paused" ? (
              <span className="inline-flex items-center gap-1.5 text-white/70">
                <Pause className="h-3 w-3" /> Meter frozen, you are not paying while paused
              </span>
            ) : phase === "settled" ? (
              <span className="inline-flex items-center gap-1.5 text-emerald-300">
                <CheckCircle2 className="h-3 w-3" /> Final amount, settled on-chain
              </span>
            ) : phase === "settling" ? (
              "Signing the final voucher and closing the channel"
            ) : (
              <>You pay by the second, only for what you watch</>
            )}
          </p>
        </div>

        {/* Deposit gauge: a semicircle that fills with sp-gold as the deposit
            is consumed (and "Remaining" below drains toward zero). */}
        <div className="mt-5 flex items-end justify-center">
          <div className="relative" style={{ width: 168, height: 92 }}>
            <svg width="168" height="92" viewBox="0 0 132 72" className="overflow-visible">
              <path
                d={`M 14 66 A ${R} ${R} 0 0 1 118 66`}
                fill="none"
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="10"
                strokeLinecap="round"
              />
              <path
                d={`M 14 66 A ${R} ${R} 0 0 1 118 66`}
                fill="none"
                stroke="var(--color-sp-gold)"
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={CIRC}
                strokeDashoffset={dashOffset}
                style={{ transition: "stroke-dashoffset 200ms linear" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-end pb-1">
              <span className="font-mono text-lg font-bold tabular-nums text-white">
                {Math.round(pct * 100)}%
              </span>
              <span className="text-[10px] uppercase tracking-wider text-white/40">
                deposit used
              </span>
            </div>
          </div>
        </div>

        {/* Stat row: watched / deposit / remaining */}
        <div className="mt-4 grid grid-cols-3 gap-2 text-center font-mono">
          <div className="rounded-xl bg-white/5 px-2 py-2.5">
            <div className="text-[10px] uppercase tracking-wider text-white/40">Watched</div>
            <div className="mt-0.5 text-sm font-semibold tabular-nums text-white">
              {fmtClock(session.secondsWatched)}
            </div>
          </div>
          <div className="rounded-xl bg-white/5 px-2 py-2.5">
            <div className="text-[10px] uppercase tracking-wider text-white/40">Deposit</div>
            <div className="mt-0.5 text-sm font-semibold tabular-nums text-white">
              ${fmtUsdc(deposit, 4)}
            </div>
          </div>
          <div className="rounded-xl bg-white/5 px-2 py-2.5">
            <div className="text-[10px] uppercase tracking-wider text-white/40">Remaining</div>
            <div className="mt-0.5 text-sm font-semibold tabular-nums text-sp-gold">
              ${fmtUsdc(remaining, 4)}
            </div>
          </div>
        </div>

        {/* Action / status footer */}
        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-[11px] font-mono">
            {session.txHashOpen && (
              <a
                href={arcTxUrl(session.txHashOpen)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sp-blue hover:underline"
              >
                open tx <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {session.txHashClose && (
              <a
                href={arcTxUrl(session.txHashClose)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sp-blue hover:underline"
              >
                close tx <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>

          {session.state === "active" && (
            <button
              type="button"
              onClick={onStop}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-500/15 px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/25"
            >
              <Square className="h-3 w-3" />
              Stop and settle
            </button>
          )}
          {session.state === "settling" && (
            <span className="inline-flex items-center gap-1.5 text-xs text-white/60">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              settling
            </span>
          )}
          {session.state === "settled" && (
            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-300">
              <CheckCircle2 className="h-3.5 w-3.5" />
              done
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
