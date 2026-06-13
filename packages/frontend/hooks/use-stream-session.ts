"use client";

/**
 * Pay-per-second streaming session lifecycle (StreamPay channels).
 *
 * One wallet transaction opens the channel with a deposit; an ephemeral
 * session key (module memory only, never persisted) silently signs a payment
 * voucher every few seconds while the video plays. The backend gates HLS
 * segment delivery on voucher freshness and settles on-chain when the viewer
 * stops: the viewer pays exactly for the seconds watched.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, useWriteContract } from "wagmi";
import { createPublicClient, http, keccak256, encodePacked, decodeEventLog } from "viem";
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { useEnsureNetwork } from "./use-network-switch";
import { getDefaultChain, getDefaultChainId } from "@/lib/chains";
import { STREAMPAY_ADDRESS, STREAMPAY_ABI, usdcToWei, weiToUsdc, isStreamPayDeployed } from "@/lib/streampay";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const HEARTBEAT_INTERVAL_MS = 5_000;

const CURRENT_CHAIN = getDefaultChain();
const CURRENT_CHAIN_ID = getDefaultChainId();

const streamClient = createPublicClient({ chain: CURRENT_CHAIN, transport: http() });

export type StreamSessionState =
  | "idle"
  | "opening"
  | "active"
  | "settling"
  | "settled"
  | "error";

export interface UseStreamSessionOptions {
  resourceSlug: string;
  creatorWallet: string | null;
  pricePerSecondUsdc: number;
  /** Caller-provided playback probe; the meter only runs while this is true. */
  isPlaying: () => boolean;
}

export interface StreamSessionApi {
  state: StreamSessionState;
  error: string | null;
  secondsWatched: number;
  spentUsdc: number;
  depositUsdc: number;
  refundUsdc: number | null;
  txHashOpen: string | null;
  txHashClose: string | null;
  sessionId: string | null;
  hlsToken: string | null;
  /** Per-second rate in USDC (echoed back for the live meter readout). */
  ratePerSecondUsdc: number;
  /**
   * True only while the channel is "active" AND the video is actually
   * playing. The meter ticks up and pulses on this; when false (paused or
   * buffering) the meter visibly freezes. Sampled at ~10Hz, so it lags a
   * play/pause by at most ~100ms.
   */
  isMetering: boolean;
  /** Open the channel with a deposit (in USDC) and start metering. */
  start: (depositUsdc: number) => Promise<void>;
  /** Stop watching: settle on-chain and wait for the receipt. */
  stop: () => Promise<void>;
}

function friendlyError(err: any): string {
  if (err?.code === 4001 || /user rejected/i.test(err?.shortMessage || ""))
    return "You rejected the transaction in your wallet.";
  if (/insufficient funds/i.test(err?.shortMessage || err?.message || ""))
    return `Insufficient USDC balance on ${CURRENT_CHAIN.name}.`;
  if (err?.message?.startsWith("Please switch")) return err.message;
  if (err?.name === "TypeError" && /fetch/i.test(err?.message || ""))
    return "Cannot reach the server. Check your connection and try again.";
  return err?.shortMessage || err?.message || "Something went wrong.";
}

export function useStreamSession(options: UseStreamSessionOptions): StreamSessionApi {
  const { isConnected } = useAccount();
  const { ensureCorrectNetwork } = useEnsureNetwork(CURRENT_CHAIN_ID);
  const { writeContractAsync } = useWriteContract();

  const [state, setState] = useState<StreamSessionState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [secondsWatched, setSecondsWatched] = useState(0);
  // Live "money is flowing" signal for the meter UI (active + actually playing)
  const [isMetering, setIsMetering] = useState(false);
  const [hlsToken, setHlsToken] = useState<string | null>(null);
  const [txHashOpen, setTxHashOpen] = useState<string | null>(null);
  const [txHashClose, setTxHashClose] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [depositUsdc, setDepositUsdc] = useState(0);
  const [refundUsdc, setRefundUsdc] = useState<number | null>(null);

  // Mutable session internals (avoid stale closures in the metering tick)
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const stateRef = useRef<StreamSessionState>("idle");
  stateRef.current = state;
  const sessionKeyRef = useRef<PrivateKeyAccount | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const depositWeiRef = useRef<bigint>(0n);
  const rateWeiRef = useRef<bigint>(0n);
  const secondsRef = useRef(0);
  const lastHeartbeatAtRef = useRef(0);
  const heartbeatInFlightRef = useRef(false);
  const tickTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const rateWei = usdcToWei(options.pricePerSecondUsdc);
  rateWeiRef.current = rateWei;

  const currentOwedWei = useCallback((): bigint => {
    const owed = BigInt(Math.floor(secondsRef.current)) * rateWeiRef.current;
    return owed > depositWeiRef.current ? depositWeiRef.current : owed;
  }, []);

  /** Sign a voucher for the current amount owed and trade it for a fresh HLS token. */
  const sendHeartbeat = useCallback(async (): Promise<boolean> => {
    const key = sessionKeyRef.current;
    const sid = sessionIdRef.current;
    if (!key || !sid || heartbeatInFlightRef.current) return false;

    heartbeatInFlightRef.current = true;
    try {
      const amountOwedWei = currentOwedWei();
      const digest = keccak256(
        encodePacked(
          ["string", "uint256", "address", "uint256", "uint256"],
          ["SUPERPAGE_STREAM", BigInt(CURRENT_CHAIN_ID), STREAMPAY_ADDRESS, BigInt(sid), amountOwedWei]
        )
      );
      const signature = await key.signMessage({ message: { raw: digest } });

      const res = await fetch(`${API_URL}/stream/session/${sid}/heartbeat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountOwedWei: amountOwedWei.toString(),
          secondsWatched: Math.floor(secondsRef.current),
          signature,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        console.error("[stream-session] heartbeat rejected:", body?.error);
        return false;
      }
      const body = await res.json();
      if (body.hlsToken) setHlsToken(body.hlsToken);
      lastHeartbeatAtRef.current = Date.now();
      return true;
    } catch (err) {
      console.error("[stream-session] heartbeat failed:", err);
      return false;
    } finally {
      heartbeatInFlightRef.current = false;
    }
  }, [currentOwedWei]);

  const stopTicking = useCallback(() => {
    if (tickTimerRef.current) {
      clearInterval(tickTimerRef.current);
      tickTimerRef.current = null;
    }
  }, []);

  const startTicking = useCallback(() => {
    stopTicking();
    tickTimerRef.current = setInterval(() => {
      if (stateRef.current !== "active") return;
      if (!optionsRef.current.isPlaying()) return;
      secondsRef.current += 1;
      setSecondsWatched(secondsRef.current);
      // Heartbeat every 5s of playback (also fires right after a long pause,
      // refreshing the token before segment fetches stall)
      if (Date.now() - lastHeartbeatAtRef.current >= HEARTBEAT_INTERVAL_MS) {
        void sendHeartbeat();
      }
    }, 1_000);
  }, [sendHeartbeat, stopTicking]);

  /** Poll the backend until settlement lands, then surface the receipt. */
  const awaitSettlement = useCallback(async (sid: string) => {
    for (let i = 0; i < 45; i++) {
      try {
        const res = await fetch(`${API_URL}/stream/session/${sid}`);
        if (res.ok) {
          const body = await res.json();
          if (body.status === "settled" || body.status === "expired") {
            setTxHashClose(body.txHashClose || null);
            const paid = weiToUsdc(BigInt(body.lastAmountWei || "0"));
            setRefundUsdc(Math.max(0, weiToUsdc(depositWeiRef.current) - paid));
            setState("settled");
            return;
          }
        }
      } catch {
        // Transient poll error, keep trying
      }
      await new Promise((r) => setTimeout(r, 2_000));
    }
    // Settlement did not land in time; deposit is reclaimable on-chain after 24h
    setState("settled");
  }, []);

  const start = useCallback(
    async (depositUsdcInput: number) => {
      const { resourceSlug, creatorWallet, pricePerSecondUsdc } = optionsRef.current;
      try {
        if (!isStreamPayDeployed()) throw new Error("StreamPay contract is not deployed yet.");
        if (!isConnected) throw new Error("Connect your wallet first.");
        if (!creatorWallet) throw new Error("This video has no creator wallet configured.");

        setError(null);
        setState("opening");

        const switched = await ensureCorrectNetwork();
        if (!switched) throw new Error(`Please switch to ${CURRENT_CHAIN.name} network`);

        // Ephemeral session key: lives in module memory only
        const sessionKey = privateKeyToAccount(generatePrivateKey());
        sessionKeyRef.current = sessionKey;

        const depositWei = usdcToWei(depositUsdcInput);
        const openRateWei = usdcToWei(pricePerSecondUsdc);
        depositWeiRef.current = depositWei;
        setDepositUsdc(depositUsdcInput);

        const hash = await writeContractAsync({
          abi: STREAMPAY_ABI,
          address: STREAMPAY_ADDRESS,
          functionName: "openSession",
          args: [creatorWallet as `0x${string}`, openRateWei, sessionKey.address],
          value: depositWei,
          chainId: CURRENT_CHAIN_ID,
        });
        setTxHashOpen(hash);

        const receipt = await streamClient.waitForTransactionReceipt({ hash, confirmations: 1 });
        if (receipt.status === "reverted") throw new Error("Transaction reverted: channel not opened.");

        // Pull the on-chain session id out of the SessionOpened log
        let openedId: bigint | null = null;
        for (const log of receipt.logs) {
          if (log.address.toLowerCase() !== STREAMPAY_ADDRESS.toLowerCase()) continue;
          try {
            const decoded = decodeEventLog({
              abi: STREAMPAY_ABI,
              data: log.data,
              topics: log.topics,
              eventName: "SessionOpened",
            });
            openedId = decoded.args.id;
            break;
          } catch {
            // Not the SessionOpened event, keep scanning
          }
        }
        if (openedId === null) throw new Error("Channel opened but SessionOpened event was not found.");

        const sid = openedId.toString();
        sessionIdRef.current = sid;
        setSessionId(sid);

        // Register with the backend: it verifies the channel on-chain
        const regRes = await fetch(`${API_URL}/stream/session/register`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ resourceSlug, sessionId: sid }),
        });
        if (!regRes.ok) {
          const body = await regRes.json().catch(() => ({}));
          throw new Error(body?.error || "Backend rejected the session.");
        }
        const regBody = await regRes.json();
        setHlsToken(regBody.hlsToken);
        lastHeartbeatAtRef.current = Date.now();

        secondsRef.current = 0;
        setSecondsWatched(0);
        setState("active");
        startTicking();
      } catch (err: any) {
        console.error("[stream-session] start failed:", err);
        setError(friendlyError(err));
        setState("error");
        throw err;
      }
    },
    [isConnected, ensureCorrectNetwork, writeContractAsync, startTicking]
  );

  const stop = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (!sid || stateRef.current !== "active") return;

    stopTicking();
    setState("settling");

    // Final voucher for the exact seconds watched, then settle
    await sendHeartbeat();
    try {
      await fetch(`${API_URL}/stream/session/${sid}/close`, { method: "POST" });
    } catch (err) {
      console.error("[stream-session] close request failed:", err);
    }
    await awaitSettlement(sid);
  }, [sendHeartbeat, awaitSettlement, stopTicking]);

  // Settle on tab close: sendBeacon delivers even while the page unloads.
  // The latest voucher is already on the server from the last heartbeat.
  useEffect(() => {
    const onUnload = () => {
      const sid = sessionIdRef.current;
      if (sid && stateRef.current === "active") {
        navigator.sendBeacon(`${API_URL}/stream/session/${sid}/close`);
      }
    };
    window.addEventListener("pagehide", onUnload);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("pagehide", onUnload);
      window.removeEventListener("beforeunload", onUnload);
      onUnload();
      stopTicking();
    };
  }, [stopTicking]);

  // Sample the playback probe at ~10Hz so the meter UI knows, near-instantly,
  // whether money is currently flowing (active + playing) versus frozen
  // (paused / buffering). Read-only: it never touches what is owed or signed.
  useEffect(() => {
    if (state !== "active") {
      setIsMetering(false);
      return;
    }
    const id = setInterval(() => {
      const flowing = optionsRef.current.isPlaying();
      setIsMetering((prev) => (prev === flowing ? prev : flowing));
    }, 100);
    return () => clearInterval(id);
  }, [state]);

  const spentWei = BigInt(Math.floor(secondsWatched)) * rateWei;
  const spentUsdc = weiToUsdc(spentWei > depositWeiRef.current ? depositWeiRef.current : spentWei);

  return {
    state,
    error,
    secondsWatched,
    spentUsdc,
    depositUsdc,
    refundUsdc,
    txHashOpen,
    txHashClose,
    sessionId,
    hlsToken,
    ratePerSecondUsdc: optionsRef.current.pricePerSecondUsdc,
    isMetering,
    start,
    stop,
  };
}
