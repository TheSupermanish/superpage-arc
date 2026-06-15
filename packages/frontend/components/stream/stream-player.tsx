"use client";

/**
 * HLS player wired to a StreamPay pay-per-second session.
 *
 * Free preview plays immediately with a preview token (the backend serves a
 * truncated playlist). At preview end an overlay offers to open a payment
 * channel; once the channel is active the full playlist streams while the
 * session hook signs per-second vouchers in the background.
 */

import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { getTxUrl } from "@/lib/chain-config";
import { isStreamPayDeployed } from "@/lib/streampay";
import type { StreamSessionApi } from "@/hooks/use-stream-session";
import { Loader2, Play, ExternalLink, AlertCircle, Wallet, Zap } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

type PlayerPhase = "loading" | "preview" | "gate" | "streaming" | "done";

interface StreamPlayerProps {
  resourceId: string;
  slug: string;
  pricePerSecondUsdc: number;
  durationSeconds: number;
  freePreviewSeconds: number;
  coverImage?: string | null;
  session: StreamSessionApi;
  /** Shared with the session hook: true only while the video is actually playing. */
  isPlayingRef: MutableRefObject<boolean>;
}

function withToken(url: string, token: string | null): string {
  if (!token) return url;
  try {
    const u = new URL(url, typeof window !== "undefined" ? window.location.origin : API_URL);
    u.searchParams.set("t", token);
    return u.toString();
  } catch {
    return url;
  }
}

function fmtUsdc(n: number, dp = 6): string {
  return n.toFixed(dp).replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1");
}

export function StreamPlayer({
  resourceId,
  slug,
  pricePerSecondUsdc,
  durationSeconds,
  freePreviewSeconds,
  coverImage,
  session,
  isPlayingRef,
}: StreamPlayerProps) {
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();

  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<{ destroy: () => void } | null>(null);
  const tokenRef = useRef<string | null>(null);

  const [phase, setPhase] = useState<PlayerPhase>("loading");
  const phaseRef = useRef<PlayerPhase>("loading");
  phaseRef.current = phase;

  const [loadError, setLoadError] = useState<string | null>(null);

  // Deposit selection: default covers the whole paid portion, floor $0.10
  const paidSeconds = Math.max(0, durationSeconds - freePreviewSeconds);
  const fullDeposit = Math.max(0.1, Math.ceil(pricePerSecondUsdc * paidSeconds * 1e4) / 1e4);
  const [depositInput, setDepositInput] = useState(String(fullDeposit));

  const sessionRef = useRef(session);
  const resumeOnVisibleRef = useRef(false);
  sessionRef.current = session;

  const destroyHls = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
  }, []);

  /** Attach the HLS source with the current token (hls.js, native fallback). */
  const attachStream = useCallback(
    async (startAt: number, autoplay: boolean) => {
      const video = videoRef.current;
      if (!video) return;
      destroyHls();

      const src = `${API_URL}/stream/hls/${resourceId}/index.m3u8`;
      const { default: Hls } = await import("hls.js");

      if (Hls.isSupported()) {
        const hls = new Hls({
          // Fresh token on every playlist/segment request; expired tokens
          // stop segment delivery within 60s of the last heartbeat.
          xhrSetup: (xhr: XMLHttpRequest, url: string) => {
            xhr.open("GET", withToken(url, tokenRef.current), true);
          },
        });
        hls.on(Hls.Events.ERROR, (_evt: unknown, data: { fatal: boolean; type: string }) => {
          if (data.fatal) {
            console.error("[stream-player] fatal hls error:", data.type);
            setLoadError("Stream interrupted. The payment token may have expired.");
          }
        });
        hls.loadSource(withToken(src, tokenRef.current));
        hls.attachMedia(video);
        hlsRef.current = hls;
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        // Safari native HLS: the backend bakes the token into segment URIs
        video.src = withToken(src, tokenRef.current);
      } else {
        setLoadError("This browser cannot play HLS streams.");
        return;
      }

      const onLoaded = () => {
        if (startAt > 0) video.currentTime = startAt;
        if (autoplay) void video.play().catch(() => {});
        video.removeEventListener("loadedmetadata", onLoaded);
      };
      video.addEventListener("loadedmetadata", onLoaded);
    },
    [resourceId, destroyHls]
  );

  // Boot: fetch a preview token and start the free preview
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/stream/preview-token/${slug}`);
        if (!res.ok) throw new Error("Could not load preview");
        const body = await res.json();
        if (cancelled) return;
        tokenRef.current = body.token;
        setPhase("preview");
        await attachStream(0, false);
      } catch (err: any) {
        if (!cancelled) setLoadError(err.message || "Could not load video");
      }
    })();
    return () => {
      cancelled = true;
      destroyHls();
    };
  }, [slug, attachStream, destroyHls]);

  // Keep the freshest session token available to xhrSetup
  useEffect(() => {
    if (session.hlsToken && (session.state === "active" || session.state === "settling")) {
      tokenRef.current = session.hlsToken;
    }
  }, [session.hlsToken, session.state]);

  // Channel opened: switch from preview playlist to the full stream
  useEffect(() => {
    if (session.state === "active" && phaseRef.current !== "streaming") {
      tokenRef.current = session.hlsToken;
      setPhase("streaming");
      void attachStream(freePreviewSeconds, true);
    }
    if ((session.state === "settling" || session.state === "settled") && phaseRef.current !== "done") {
      setPhase("done");
      isPlayingRef.current = false;
      videoRef.current?.pause();
      destroyHls();
    }
  }, [session.state, session.hlsToken, attachStream, destroyHls, freePreviewSeconds, isPlayingRef]);

  // Pay-per-second must not bill for a tab you're not watching. Pause when the
  // tab is hidden (the meter only ticks while the video reports playing, so this
  // stops the charge), and resume on return if it was playing.
  useEffect(() => {
    const onVisibility = () => {
      const video = videoRef.current;
      if (!video) return;
      const inStream = phaseRef.current === "preview" || phaseRef.current === "streaming";
      if (document.hidden) {
        if (inStream && !video.paused) {
          resumeOnVisibleRef.current = true;
          video.pause();
        }
      } else if (resumeOnVisibleRef.current) {
        resumeOnVisibleRef.current = false;
        if (inStream) void video.play().catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // ── Video events: drive the meter and the preview gate ──

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (phaseRef.current === "preview" && video.currentTime >= freePreviewSeconds - 0.05) {
      video.pause();
      isPlayingRef.current = false;
      setPhase("gate");
    }
  }, [freePreviewSeconds, isPlayingRef]);

  const handleEnded = useCallback(() => {
    isPlayingRef.current = false;
    if (phaseRef.current === "preview") {
      setPhase("gate");
    } else if (phaseRef.current === "streaming") {
      // Watched to the end: settle automatically
      void sessionRef.current.stop();
    }
  }, [isPlayingRef]);

  const handleStart = useCallback(async () => {
    if (!isConnected) {
      openConnectModal?.();
      return;
    }
    const deposit = Math.max(0.1, parseFloat(depositInput) || 0);
    try {
      await session.start(deposit);
    } catch {
      // Error state surfaced via session.error
    }
  }, [isConnected, openConnectModal, depositInput, session]);

  const opening = session.state === "opening";
  const showGate = phase === "gate" && session.state !== "active" && session.state !== "settling" && session.state !== "settled";

  return (
    <div className="relative w-full rounded-2xl overflow-hidden bg-black border border-border">
      <video
        ref={videoRef}
        className="w-full aspect-video bg-black"
        poster={coverImage || undefined}
        controls={phase === "preview" || phase === "streaming"}
        playsInline
        onPlaying={() => {
          if (phaseRef.current === "preview" || phaseRef.current === "streaming") isPlayingRef.current = true;
        }}
        onPause={() => (isPlayingRef.current = false)}
        onWaiting={() => (isPlayingRef.current = false)}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
      />

      {/* Loading */}
      {phase === "loading" && !loadError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70">
          <Loader2 className="h-8 w-8 text-white animate-spin" />
        </div>
      )}

      {/* Load / playback error */}
      {loadError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80 p-6 text-center">
          <AlertCircle className="h-8 w-8 text-red-400" />
          <p className="text-sm text-red-300">{loadError}</p>
        </div>
      )}

      {/* Preview hint */}
      {phase === "preview" && !loadError && (
        <div className="absolute top-3 left-3 px-3 py-1.5 rounded-full bg-black/70 backdrop-blur text-xs font-medium text-white/90 pointer-events-none">
          Free preview: first {freePreviewSeconds}s
        </div>
      )}

      {/* Paywall gate at preview end */}
      {showGate && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
          <div className="w-full max-w-md space-y-4 text-center">
            <div className="mx-auto size-12 rounded-2xl bg-sp-gold/15 flex items-center justify-center">
              <Zap className="h-6 w-6 text-sp-gold" />
            </div>
            <div>
              <p className="text-lg font-bold text-white">
                Keep watching for ${fmtUsdc(pricePerSecondUsdc)} per second
              </p>
              <p className="text-sm text-white/60 mt-1">
                Approve a spending cap once (your USDC stays in your wallet), then
                watch. You only pay for the seconds you watch; nothing is locked
                and there's no refund step.
              </p>
            </div>

            <div className="flex items-center gap-2 justify-center">
              <label htmlFor="stream-deposit" className="text-sm text-white/70">
                Spending cap (USDC)
              </label>
              <input
                id="stream-deposit"
                type="number"
                min={0.1}
                step={0.01}
                value={depositInput}
                onChange={(e) => setDepositInput(e.target.value)}
                disabled={opening}
                className="w-28 px-3 py-2 rounded-xl bg-white/10 border border-white/20 text-white text-sm focus:border-sp-gold focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setDepositInput(String(fullDeposit))}
                disabled={opening}
                className="text-xs text-sp-gold hover:underline"
              >
                Full video (${fmtUsdc(fullDeposit, 4)})
              </button>
            </div>
            <p className="text-xs text-white/40">
              Minimum $0.10. The unused cap just stays in your wallet as an approval,
              reusable for your next watch.
            </p>

            {!isStreamPayDeployed() && (
              <p className="text-xs text-amber-400">
                Streaming contract is not deployed yet. Check back soon.
              </p>
            )}
            {session.state === "error" && session.error && (
              <p className="text-sm text-red-400">{session.error}</p>
            )}

            <button
              type="button"
              onClick={handleStart}
              disabled={opening || !isStreamPayDeployed()}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-sp-gold hover:bg-sp-gold/90 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold transition-colors"
            >
              {opening ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Opening channel...
                </>
              ) : !isConnected ? (
                <>
                  <Wallet className="h-4 w-4" />
                  Connect wallet to stream
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Start streaming
                </>
              )}
            </button>

            {session.txHashOpen && opening && (
              <a
                href={getTxUrl(session.txHashOpen)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-sp-gold hover:underline"
              >
                View transaction <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      )}

      {/* While streaming, a slim live pill overlays the top-left of the video so
          the "paying by the second" signal stays visible (the preview hint is
          gone by now); the full HUD lives beside the player. */}
      {phase === "streaming" && session.state === "active" && (
        <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 font-mono text-xs">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 backdrop-blur ${
              session.isMetering ? "bg-sp-gold/20 text-sp-gold" : "bg-black/60 text-white/70"
            }`}
          >
            <span className="relative flex h-1.5 w-1.5">
              {session.isMetering && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sp-gold opacity-70" />
              )}
              <span
                className={`relative inline-flex h-1.5 w-1.5 rounded-full ${
                  session.isMetering ? "bg-sp-gold" : "bg-white/50"
                }`}
              />
            </span>
            {session.isMetering ? "metering" : "paused"}
          </span>
          <span className="rounded-full bg-black/60 px-2.5 py-1 text-sp-gold tabular-nums backdrop-blur">
            ${fmtUsdc(session.spentUsdc)}
          </span>
        </div>
      )}
    </div>
  );
}
