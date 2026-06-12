/**
 * Pay-per-second video streaming routes (RFB 4).
 *
 * Flow:
 *   creator: POST /stream/upload -> transcode to HLS -> video resource
 *   viewer:  opens a StreamPay channel on-chain, then
 *            POST /stream/session/register -> short-lived HLS token
 *            POST /stream/session/:id/heartbeat (signed voucher) -> fresh token
 *            GET  /stream/hls/:resourceId/:file?t=<token> -> gated segments
 *            POST /stream/session/:id/close -> on-chain settlement
 */
import { Router, type Router as ExpressRouter, Request, Response } from "express";
import multer from "multer";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { keccak256, encodePacked, recoverMessageAddress } from "viem";
import { Resource } from "../models/index.js";
import { StreamSession } from "../models/StreamSession.js";
import { authMiddleware, type AuthenticatedRequest } from "../api/wallet-auth.js";
import { getChainConfig } from "../config/chain-config.js";
import { STREAMPAY_ADDRESS, STREAMPAY_ABI, isStreamPayDeployed, usdcToWei } from "../config/streampay.js";
import {
  HLS_ROOT,
  VIDEO_SRC_ROOT,
  transcodeToHls,
  getTranscodeStatus,
  setTranscodeStatus,
} from "../services/hls-transcode.js";
import { settle, streamPublicClient, startSettlementSweep } from "../services/stream-settlement.js";

const router: ExpressRouter = Router();

const JWT_SECRET = process.env.JWT_SECRET as string;
const HLS_TOKEN_TTL = "60s";
const PREVIEW_TOKEN_TTL = "10m";
const DEFAULT_FREE_PREVIEW_SECONDS = 10;

// Start the stale-session sweep when this module is first loaded
startSettlementSweep();

// ============================================================
// UPLOAD + TRANSCODE
// ============================================================

const videoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, VIDEO_SRC_ROOT),
  filename: (_req, file, cb) => {
    cb(null, `${Date.now()}-${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`);
  },
});

const ALLOWED_VIDEO_EXT = new Set([".mp4", ".mov", ".webm"]);
const ALLOWED_VIDEO_MIME = new Set(["video/mp4", "video/quicktime", "video/webm"]);

const videoUpload = multer({
  storage: videoStorage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2GB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_VIDEO_EXT.has(ext) || ALLOWED_VIDEO_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only mp4, mov, or webm videos are accepted"));
    }
  },
});

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 50);
}

/**
 * @route   POST /stream/upload
 * @desc    Upload a video, kick off HLS transcode, create the video resource
 * @access  Protected (creator JWT)
 */
router.post("/upload", authMiddleware, videoUpload.single("file"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.creator) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: "No video file uploaded" });
    }

    const { name, description, coverImage } = req.body;
    const pricePerSecondUsdc = parseFloat(req.body.pricePerSecondUsdc);
    const freePreviewSeconds = Math.max(0, parseInt(req.body.freePreviewSeconds, 10) || DEFAULT_FREE_PREVIEW_SECONDS);

    if (!name) {
      fs.unlink(file.path, () => {});
      return res.status(400).json({ error: "name is required" });
    }
    if (!Number.isFinite(pricePerSecondUsdc) || pricePerSecondUsdc <= 0) {
      fs.unlink(file.path, () => {});
      return res.status(400).json({ error: "pricePerSecondUsdc must be a positive number" });
    }

    // Create the resource immediately so the client can poll transcode status
    const baseConfig = {
      pricePerSecondUsdc,
      durationSeconds: 0,
      hlsMasterPath: "",
      originalFilename: file.originalname,
      coverImage: coverImage || undefined,
      freePreviewSeconds,
      transcodeStatus: "processing",
    };

    let resource;
    try {
      resource = await Resource.create({
        creatorId: req.creator.id,
        slug: generateSlug(name),
        type: "video",
        name,
        description: description || undefined,
        priceUsdc: 0,
        config: baseConfig,
        isActive: true,
      });
    } catch (error: any) {
      if (error.code === 11000 && error.keyPattern?.slug) {
        resource = await Resource.create({
          creatorId: req.creator.id,
          slug: `${generateSlug(name)}-${crypto.randomBytes(3).toString("hex")}`,
          type: "video",
          name,
          description: description || undefined,
          priceUsdc: 0,
          config: baseConfig,
          isActive: true,
        });
      } else {
        throw error;
      }
    }

    const resourceId = resource._id!.toString();
    setTranscodeStatus(resourceId, { status: "processing" });

    // Transcode in-process; the client polls /stream/transcode-status
    transcodeToHls(file.path, resourceId)
      .then(async ({ durationSeconds }) => {
        const totalPrice = Math.round(pricePerSecondUsdc * durationSeconds * 1e6) / 1e6;
        await Resource.updateOne(
          { _id: resourceId },
          {
            $set: {
              priceUsdc: totalPrice,
              "config.durationSeconds": durationSeconds,
              "config.hlsMasterPath": `/stream/hls/${resourceId}/index.m3u8`,
              "config.transcodeStatus": "ready",
            },
          }
        );
        setTranscodeStatus(resourceId, { status: "ready", durationSeconds });
        console.log(`[stream] resource ${resourceId} ready: ${durationSeconds}s, ${totalPrice} USDC total`);
      })
      .catch(async (err: any) => {
        console.error(`[stream] transcode failed for ${resourceId}:`, err.message);
        setTranscodeStatus(resourceId, { status: "error", error: err.message });
        await Resource.updateOne(
          { _id: resourceId },
          { $set: { "config.transcodeStatus": "error", isActive: false } }
        ).catch(() => {});
      });

    return res.status(201).json({
      resource: {
        id: resourceId,
        slug: resource.slug,
        type: resource.type,
        name: resource.name,
        description: resource.description,
        config: resource.config,
      },
      transcodeStatus: "processing",
    });
  } catch (err: any) {
    console.error("[stream] upload error:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
});

/**
 * @route   GET /stream/transcode-status/:resourceId
 * @desc    Poll transcode progress for a freshly uploaded video
 * @access  Public (status only, no content)
 */
router.get("/transcode-status/:resourceId", async (req: Request, res: Response) => {
  try {
    const { resourceId } = req.params;
    const inMemory = getTranscodeStatus(resourceId);
    if (inMemory) {
      return res.json({ resourceId, ...inMemory });
    }

    // Fall back to the persisted state (covers backend restarts)
    if (!mongoose.Types.ObjectId.isValid(resourceId)) {
      return res.status(404).json({ error: "Resource not found" });
    }
    const resource = await Resource.findById(resourceId).lean();
    if (!resource || resource.type !== "video") {
      return res.status(404).json({ error: "Resource not found" });
    }
    return res.json({
      resourceId,
      status: resource.config?.transcodeStatus || "processing",
      durationSeconds: resource.config?.durationSeconds || 0,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Server error" });
  }
});

// ============================================================
// PUBLIC METADATA
// ============================================================

/**
 * @route   GET /stream/meta/:slug
 * @desc    Public metadata for the watch page
 * @access  Public
 */
router.get("/meta/:slug", async (req: Request, res: Response) => {
  try {
    const resource: any = await Resource.findOne({ slug: req.params.slug, type: "video" })
      .populate("creatorId", "walletAddress username name avatarUrl")
      .lean();

    if (!resource || !resource.isActive) {
      return res.status(404).json({ error: "Video not found" });
    }

    return res.json({
      id: resource._id.toString(),
      slug: resource.slug,
      name: resource.name,
      description: resource.description || null,
      priceUsdc: resource.priceUsdc,
      pricePerSecondUsdc: resource.config?.pricePerSecondUsdc || 0,
      durationSeconds: resource.config?.durationSeconds || 0,
      freePreviewSeconds: resource.config?.freePreviewSeconds ?? DEFAULT_FREE_PREVIEW_SECONDS,
      coverImage: resource.config?.coverImage || null,
      transcodeStatus: resource.config?.transcodeStatus || "ready",
      streamPayAddress: isStreamPayDeployed() ? STREAMPAY_ADDRESS : null,
      creator: {
        walletAddress: resource.creatorId?.walletAddress || null,
        username: resource.creatorId?.username || null,
        name: resource.creatorId?.name || null,
        avatarUrl: resource.creatorId?.avatarUrl || null,
      },
    });
  } catch (err: any) {
    console.error("[stream] meta error:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
});

// ============================================================
// SESSION LIFECYCLE
// ============================================================

interface HlsTokenPayload {
  rid: string;
  sid?: string;
  scope: "full" | "preview";
}

function signHlsToken(payload: HlsTokenPayload, ttl: string): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ttl } as jwt.SignOptions);
}

/**
 * @route   POST /stream/session/register
 * @desc    Verify a freshly opened on-chain session and issue the first HLS token
 * @access  Public (the on-chain session is the credential)
 */
router.post("/session/register", async (req: Request, res: Response) => {
  try {
    const { resourceSlug, sessionId } = req.body || {};
    if (!resourceSlug || sessionId === undefined || sessionId === null) {
      return res.status(400).json({ error: "resourceSlug and sessionId are required" });
    }
    if (!isStreamPayDeployed()) {
      return res.status(503).json({ error: "StreamPay contract is not deployed yet" });
    }

    const resource: any = await Resource.findOne({ slug: resourceSlug, type: "video" })
      .populate("creatorId", "walletAddress")
      .lean();
    if (!resource || !resource.isActive) {
      return res.status(404).json({ error: "Video not found" });
    }

    let onChainId: bigint;
    try {
      onChainId = BigInt(sessionId);
    } catch {
      return res.status(400).json({ error: "sessionId must be a numeric string" });
    }

    // Read the session straight from the contract
    const [viewer, creator, sessionKey, deposit, ratePerSecond, , open] =
      await streamPublicClient.readContract({
        address: STREAMPAY_ADDRESS,
        abi: STREAMPAY_ABI,
        functionName: "getSession",
        args: [onChainId],
      });

    if (!open) {
      return res.status(400).json({ error: "Session is not open on-chain" });
    }

    const creatorWallet = (resource.creatorId?.walletAddress || "").toLowerCase();
    if (!creatorWallet || creator.toLowerCase() !== creatorWallet) {
      return res.status(400).json({ error: "Session creator does not match resource creator" });
    }

    const expectedRate = usdcToWei(resource.config?.pricePerSecondUsdc || 0);
    if (expectedRate <= 0n || ratePerSecond !== expectedRate) {
      return res.status(400).json({ error: "Session rate does not match resource price" });
    }

    const sid = onChainId.toString();
    await StreamSession.findOneAndUpdate(
      { sessionId: sid },
      {
        $setOnInsert: {
          sessionId: sid,
          resourceId: resource._id,
          viewerAddress: viewer.toLowerCase(),
          sessionKey: sessionKey.toLowerCase(),
          ratePerSecondWei: ratePerSecond.toString(),
          depositWei: deposit.toString(),
          lastAmountWei: "0",
          lastSig: "",
          secondsWatched: 0,
          status: "open",
        },
        $set: { lastHeartbeatAt: new Date() },
      },
      { upsert: true, new: true }
    );

    const hlsToken = signHlsToken({ rid: resource._id.toString(), sid, scope: "full" }, HLS_TOKEN_TTL);
    return res.json({ ok: true, hlsToken });
  } catch (err: any) {
    console.error("[stream] register error:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
});

/**
 * @route   POST /stream/session/:sessionId/heartbeat
 * @desc    Accept a signed per-second voucher; returns a fresh HLS token
 * @access  Public (voucher signature is the credential)
 */
router.post("/session/:sessionId/heartbeat", async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { amountOwedWei, secondsWatched, signature } = req.body || {};

    if (!amountOwedWei || !signature) {
      return res.status(400).json({ error: "amountOwedWei and signature are required" });
    }

    const session = await StreamSession.findOne({ sessionId });
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }
    if (session.status !== "open") {
      return res.status(409).json({ error: `Session is ${session.status}` });
    }

    let amount: bigint;
    try {
      amount = BigInt(amountOwedWei);
    } catch {
      return res.status(400).json({ error: "amountOwedWei must be a numeric string" });
    }

    const lastAmount = BigInt(session.lastAmountWei || "0");
    const deposit = BigInt(session.depositWei);
    const rate = BigInt(session.ratePerSecondWei);

    // Monotonic, within deposit, and plausible for the elapsed wall time
    if (amount < lastAmount) {
      return res.status(403).json({ error: "amountOwedWei must not decrease" });
    }
    if (amount > deposit) {
      return res.status(403).json({ error: "amountOwedWei exceeds deposit" });
    }
    const elapsedSeconds = Math.ceil((Date.now() - session.createdAt.getTime()) / 1000);
    const maxPlausible = rate * BigInt(elapsedSeconds + 30); // 30s slack
    if (amount > maxPlausible) {
      return res.status(403).json({ error: "amountOwedWei is implausibly high" });
    }

    // Verify the voucher: EIP-191 eth_sign over the raw 32-byte digest
    const chainId = BigInt(getChainConfig().chainId);
    const digest = keccak256(
      encodePacked(
        ["string", "uint256", "address", "uint256", "uint256"],
        ["SUPERPAGE_STREAM", chainId, STREAMPAY_ADDRESS, BigInt(sessionId), amount]
      )
    );
    let signer: string;
    try {
      signer = await recoverMessageAddress({
        message: { raw: digest },
        signature: signature as `0x${string}`,
      });
    } catch {
      return res.status(403).json({ error: "Invalid signature" });
    }
    if (signer.toLowerCase() !== session.sessionKey) {
      return res.status(403).json({ error: "Signature does not match session key" });
    }

    session.lastAmountWei = amount.toString();
    session.lastSig = signature;
    session.secondsWatched = Math.max(session.secondsWatched, Number(secondsWatched) || 0);
    session.lastHeartbeatAt = new Date();
    await session.save();

    const hlsToken = signHlsToken(
      { rid: session.resourceId.toString(), sid: sessionId, scope: "full" },
      HLS_TOKEN_TTL
    );
    return res.json({ ok: true, hlsToken });
  } catch (err: any) {
    console.error("[stream] heartbeat error:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
});

/**
 * @route   POST /stream/session/:sessionId/close
 * @desc    Stop watching: settle the channel on-chain with the latest voucher.
 *          Also hit via navigator.sendBeacon on tab close.
 * @access  Public
 */
router.post("/session/:sessionId/close", async (req: Request, res: Response) => {
  try {
    const session = await StreamSession.findOne({ sessionId: req.params.sessionId });
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }
    if (session.status !== "open") {
      return res.json({ ok: true, status: session.status, txHashClose: session.txHashClose || null });
    }

    // Settle in the background; the client polls GET /stream/session/:id
    settle(session).catch((err) => {
      console.error(`[stream] close settlement failed for ${session.sessionId}:`, err.message);
    });

    return res.json({ ok: true, status: "settling" });
  } catch (err: any) {
    console.error("[stream] close error:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
});

/**
 * @route   GET /stream/session/:sessionId
 * @desc    Session status for the receipt UI
 * @access  Public
 */
router.get("/session/:sessionId", async (req: Request, res: Response) => {
  try {
    const session = await StreamSession.findOne({ sessionId: req.params.sessionId }).lean();
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }
    return res.json({
      sessionId: session.sessionId,
      status: session.status,
      txHashClose: session.txHashClose || null,
      secondsWatched: session.secondsWatched,
      lastAmountWei: session.lastAmountWei,
      depositWei: session.depositWei,
      ratePerSecondWei: session.ratePerSecondWei,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Server error" });
  }
});

// ============================================================
// HLS DELIVERY (token-gated)
// ============================================================

/**
 * @route   GET /stream/preview-token/:slug
 * @desc    Token for the free preview (first freePreviewSeconds, no payment)
 * @access  Public
 */
router.get("/preview-token/:slug", async (req: Request, res: Response) => {
  try {
    const resource: any = await Resource.findOne({ slug: req.params.slug, type: "video" }).lean();
    if (!resource || !resource.isActive) {
      return res.status(404).json({ error: "Video not found" });
    }
    const token = signHlsToken({ rid: resource._id.toString(), scope: "preview" }, PREVIEW_TOKEN_TTL);
    return res.json({ token, resourceId: resource._id.toString() });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Server error" });
  }
});

function verifyHlsToken(token: string | undefined, resourceId: string): HlsTokenPayload | null {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload & HlsTokenPayload;
    if (payload.rid !== resourceId) return null;
    if (payload.scope !== "full" && payload.scope !== "preview") return null;
    return payload;
  } catch {
    return null;
  }
}

interface ParsedPlaylist {
  header: string[];
  segments: Array<{ extinf: string; uri: string; duration: number }>;
}

function parsePlaylist(raw: string): ParsedPlaylist {
  const lines = raw.split("\n");
  const header: string[] = [];
  const segments: ParsedPlaylist["segments"] = [];
  let pendingExtinf: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("#EXTINF")) {
      pendingExtinf = trimmed;
    } else if (trimmed.startsWith("#EXT-X-ENDLIST")) {
      // Re-appended after segment selection
    } else if (trimmed.startsWith("#")) {
      if (pendingExtinf === null && segments.length === 0) header.push(trimmed);
    } else if (pendingExtinf) {
      const duration = parseFloat(pendingExtinf.replace("#EXTINF:", "")) || 0;
      segments.push({ extinf: pendingExtinf, uri: trimmed, duration });
      pendingExtinf = null;
    }
  }
  return { header, segments };
}

/** How many leading segments a preview token may fetch, per resource. */
const previewSegmentCount = new Map<string, number>();

function getPreviewSegmentLimit(resourceId: string, playlist: ParsedPlaylist, freeSeconds: number): number {
  const cached = previewSegmentCount.get(resourceId);
  if (cached !== undefined) return cached;
  let total = 0;
  let count = 0;
  for (const seg of playlist.segments) {
    if (total >= freeSeconds) break;
    total += seg.duration;
    count += 1;
  }
  const limit = Math.max(1, count);
  previewSegmentCount.set(resourceId, limit);
  return limit;
}

const SAFE_HLS_FILE = /^[A-Za-z0-9_.-]+$/;

/**
 * @route   GET /stream/hls/:resourceId/:file?t=<token>
 * @desc    Serve playlist/segments, gated on a fresh HLS token. Preview tokens
 *          get a truncated playlist covering only the free preview window.
 * @access  Token-gated
 */
router.get("/hls/:resourceId/:file", async (req: Request, res: Response) => {
  try {
    const { resourceId, file } = req.params;

    if (!SAFE_HLS_FILE.test(file) || file.includes("..")) {
      return res.status(400).json({ error: "Bad file name" });
    }

    const token = (req.query.t as string) || undefined;
    const payload = verifyHlsToken(token, resourceId);
    if (!payload) {
      return res.status(401).json({ error: "Missing or expired stream token" });
    }

    const filePath = path.join(HLS_ROOT, resourceId, file);
    if (!filePath.startsWith(path.join(HLS_ROOT, resourceId))) {
      return res.status(400).json({ error: "Bad path" });
    }
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Not found" });
    }

    // Playlist: rewrite segment URIs to carry the current token (native HLS
    // players cannot inject query params per request). hls.js replaces the
    // token with a fresh one on every fetch via xhrSetup.
    if (file.endsWith(".m3u8")) {
      const raw = fs.readFileSync(filePath, "utf-8");
      const playlist = parsePlaylist(raw);

      let segments = playlist.segments;
      if (payload.scope === "preview") {
        const resource: any = await Resource.findById(resourceId).lean();
        const freeSeconds = resource?.config?.freePreviewSeconds ?? DEFAULT_FREE_PREVIEW_SECONDS;
        const limit = getPreviewSegmentLimit(resourceId, playlist, freeSeconds);
        segments = segments.slice(0, limit);
      }

      const out: string[] = [...playlist.header];
      for (const seg of segments) {
        out.push(seg.extinf);
        out.push(`${seg.uri}?t=${encodeURIComponent(token!)}`);
      }
      out.push("#EXT-X-ENDLIST");

      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      res.setHeader("Cache-Control", "no-store");
      return res.send(out.join("\n") + "\n");
    }

    // Segment: preview tokens may only fetch the leading preview segments
    if (payload.scope === "preview") {
      const masterPath = path.join(HLS_ROOT, resourceId, "index.m3u8");
      const resource: any = await Resource.findById(resourceId).lean();
      const freeSeconds = resource?.config?.freePreviewSeconds ?? DEFAULT_FREE_PREVIEW_SECONDS;
      const playlist = parsePlaylist(fs.readFileSync(masterPath, "utf-8"));
      const limit = getPreviewSegmentLimit(resourceId, playlist, freeSeconds);
      const allowed = new Set(playlist.segments.slice(0, limit).map((s) => s.uri));
      if (!allowed.has(file)) {
        return res.status(403).json({ error: "Segment outside free preview" });
      }
    }

    res.setHeader("Content-Type", "video/mp2t");
    res.setHeader("Cache-Control", "no-store");
    return res.sendFile(filePath);
  } catch (err: any) {
    console.error("[stream] hls error:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
});

export default router;
