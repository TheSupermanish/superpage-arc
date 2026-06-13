#!/usr/bin/env npx tsx
/**
 * Seed Script: Arc demo content for the Lepton hackathon build.
 *
 * Registers a demo creator (the dev wallet, so stream payouts land there),
 * publishes a BlockNote article, a legacy markdown article, an API resource,
 * a file resource, and uploads a generated test video through the real
 * /stream/upload + ffmpeg HLS path.
 *
 * Usage: npx tsx scripts/seed-arc-demo.ts [http://localhost:2337]
 */
import { privateKeyToAccount } from "viem/accounts";
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import mongoose from "mongoose";
import "dotenv/config";

const BASE_URL = process.argv[2] || "http://localhost:2337";
const PRIVATE_KEY = (process.env.WALLET_PRIVATE_KEY || "") as `0x${string}`;
if (!PRIVATE_KEY.startsWith("0x")) {
  console.error("WALLET_PRIVATE_KEY missing in env");
  process.exit(1);
}

const account = privateKeyToAccount(PRIVATE_KEY);

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE_URL}${path}`, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  return body;
}

// The resource-create API does not accept a tags field, so the seed writes
// tags straight to Mongo by resource id once each resource is published. This
// gives the marketplace catalog/search something to filter and facet on.
async function setTags(resourceId: string | undefined, tags: string[]) {
  if (!resourceId) return;
  const db = mongoose.connection.db;
  if (!db) return;
  await db.collection("resources").updateOne(
    { _id: new mongoose.Types.ObjectId(resourceId) },
    { $set: { tags } }
  );
}

async function login(): Promise<string> {
  const { nonce, message } = await api("/api/auth/nonce", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress: account.address }),
  });
  const signature = await account.signMessage({ message });
  const { token } = await api("/api/auth/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress: account.address, signature, nonce }),
  });
  return token;
}

// BlockNote PartialBlock JSON for the rich article
const blocks = [
  { type: "heading", props: { level: 1 }, content: "Paying by the second: how streaming money actually works" },
  { type: "paragraph", content: "For thirty years the smallest thing you could sell online was a subscription. Card fees put a floor around thirty cents under every payment, so creators bundled: a month of articles, a year of video, all priced to amortize the toll." },
  { type: "paragraph", content: "Arc removes the floor. USDC is the gas token, finality is sub-second, and a payment of a fraction of a cent costs less than the value it moves. Suddenly the natural unit of a video is not the video. It is the second." },
  { type: "heading", props: { level: 2 }, content: "The channel trick" },
  { type: "paragraph", content: "Opening one blockchain transaction per second would be absurd, even on a fast chain. The answer is a payment channel: one transaction opens a session with a deposit, then every few seconds your player signs a tiny IOU off-chain. When you stop watching, exactly one settlement transaction lands on-chain." },
  { type: "bulletListItem", content: "You deposit, say, one dollar to start watching." },
  { type: "bulletListItem", content: "While the video plays, your browser signs vouchers: 5 cents owed, 10 cents owed, 15 cents owed." },
  { type: "bulletListItem", content: "Close the tab whenever you like. The creator settles the last voucher; you are refunded the rest, automatically." },
  { type: "heading", props: { level: 2 }, content: "Why the meter stops when you pause" },
  { type: "paragraph", content: "The server only hands out video segments while fresh vouchers arrive. Pause the player and the vouchers stop, so the meter stops with them. This is proof-of-flow: you pay for delivery, not for intentions." },
  { type: "paragraph", content: "This article itself is sold the same way, just at a different grain: the first few blocks are free, and one click unlocked the rest for less than a cent. Welcome to the lepton economy." },
];

const markdown = `# Paying by the second: how streaming money actually works

For thirty years the smallest thing you could sell online was a subscription. Card fees put a floor around thirty cents under every payment, so creators bundled.

Arc removes the floor. USDC is the gas token, finality is sub-second, and a payment of a fraction of a cent costs less than the value it moves. The natural unit of a video is the second.

## The channel trick

One transaction opens a session with a deposit, then every few seconds your player signs a tiny IOU off-chain. When you stop watching, exactly one settlement transaction lands on-chain.

- You deposit, say, one dollar to start watching.
- While the video plays, your browser signs vouchers: 5 cents owed, 10 cents owed, 15 cents owed.
- Close the tab whenever you like. The creator settles the last voucher; you are refunded the rest.

## Why the meter stops when you pause

The server only hands out video segments while fresh vouchers arrive. Pause the player and the vouchers stop, so the meter stops with them. This is proof-of-flow: you pay for delivery, not for intentions.
`;

async function main() {
  console.log(`Seeding ${BASE_URL} as ${account.address}`);

  // Direct Mongo connection so we can attach tags the create API does not store.
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error("MONGODB_URI missing in env");
    process.exit(1);
  }
  await mongoose.connect(mongoUri);

  const token = await login();
  const auth = { Authorization: `Bearer ${token}` };
  const jsonAuth = { ...auth, "Content-Type": "application/json" };

  // Profile
  await api("/api/auth/me", {
    method: "PUT",
    headers: jsonAuth,
    body: JSON.stringify({
      username: "superdemo",
      displayName: "SuperPage Demo",
      bio: "Demo storefront for the Lepton hackathon: articles sold per read, video streamed per second, settled in USDC on Arc.",
      isPublic: true,
      showStats: true,
    }),
  });
  console.log("creator: @superdemo");

  // Rich BlockNote article
  const a1 = await api("/api/resources", {
    method: "POST",
    headers: jsonAuth,
    body: JSON.stringify({
      type: "article",
      name: "Paying by the second: how streaming money actually works",
      description: "Payment channels, proof-of-flow, and why the natural unit of a video is the second.",
      priceUsdc: 0.05,
      isPublic: true,
      config: {
        blocks,
        markdown,
        excerpt: "For thirty years the smallest thing you could sell online was a subscription. Arc removes the floor: the natural unit of a video is the second.",
        freeBlocks: 4,
        coverImage: "",
      },
    }),
  });
  await setTags(a1.resource?.id, ["payments", "arc", "streaming"]);
  console.log("article (blocks):", a1.resource?.slug);

  // Legacy markdown article
  const a2 = await api("/api/resources", {
    method: "POST",
    headers: jsonAuth,
    body: JSON.stringify({
      type: "article",
      name: "Arc in five minutes: USDC as gas",
      description: "What changes when the gas token is the dollar itself.",
      priceUsdc: 0.01,
      isPublic: true,
      config: {
        content: "# Arc in five minutes\n\nArc is Circle's L1 where **USDC is the native gas token**. No volatile gas asset, no bridging dance: the same dollar pays for execution and settles your purchase.\n\n## What this unlocks\n\n- Sub-cent payments that cost less than they move\n- Sub-second finality for instant checkout\n- One balance for gas and spending\n\nThe ERC-20 facade lives at `0x3600000000000000000000000000000000000000` with 6 decimals, while native balances count 18. Mind the scale.",
        mode: "direct",
      },
    }),
  });
  await setTags(a2.resource?.id, ["payments", "arc"]);
  console.log("article (legacy):", a2.resource?.slug);

  // API resource
  const r3 = await api("/api/resources", {
    method: "POST",
    headers: jsonAuth,
    body: JSON.stringify({
      type: "api",
      name: "Arc Gas Oracle API",
      description: "Live Arc testnet gas price as JSON, priced per call.",
      priceUsdc: 0.005,
      isPublic: true,
      config: { upstream_url: "https://rpc.testnet.arc.network", method: "POST" },
    }),
  });
  await setTags(r3.resource?.id, ["developer", "arc", "api"]);
  console.log("api:", r3.resource?.slug);

  // File resource (external link mode)
  const r4 = await api("/api/resources", {
    method: "POST",
    headers: jsonAuth,
    body: JSON.stringify({
      type: "file",
      name: "Nanopayments Design Notes (PDF)",
      description: "Design notes on channel-based streaming payments.",
      priceUsdc: 0.25,
      isPublic: true,
      config: { external_url: "https://developers.circle.com/gateway/nanopayments", filename: "nanopayments-notes.pdf", mode: "external" },
    }),
  });
  await setTags(r4.resource?.id, ["design", "notes"]);
  console.log("file:", r4.resource?.slug);

  // Video: generate a 90s test clip and push it through the real upload path
  const clip = join(tmpdir(), "superpage-demo-clip.mp4");
  if (!existsSync(clip)) {
    console.log("generating test video (90s)...");
    execFileSync("ffmpeg", [
      "-y",
      "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30:duration=90",
      "-f", "lavfi", "-i", "sine=frequency=440:duration=90",
      "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-shortest", clip,
    ], { stdio: "ignore" });
  }

  const form = new FormData();
  form.append("file", new Blob([readFileSync(clip)], { type: "video/mp4" }), "arc-demo-stream.mp4");
  form.append("name", "Live from the Lepton economy (demo stream)");
  form.append("description", "A 90 second demo stream. Watch free for 10 seconds, then pay per second from a refundable USDC deposit.");
  form.append("pricePerSecondUsdc", "0.001");
  form.append("freePreviewSeconds", "10");

  const up = await fetch(`${BASE_URL}/stream/upload`, { method: "POST", headers: auth, body: form });
  const upBody = await up.json().catch(() => ({}));
  if (!up.ok) throw new Error(`/stream/upload -> ${up.status}: ${JSON.stringify(upBody).slice(0, 400)}`);
  const vid = upBody.resource;
  await setTags(vid?._id || vid?.id, ["demo", "streaming", "arc"]);
  console.log("video uploaded:", vid?.slug, "(transcoding)");

  // Poll transcode
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const st = await api(`/stream/transcode-status/${vid._id || vid.id}`);
    if (st.status === "ready") { console.log("video ready:", vid.slug); break; }
    if (st.status === "failed") throw new Error(`transcode failed: ${JSON.stringify(st)}`);
    if (i === 59) throw new Error("transcode timed out");
  }

  console.log("\nSeed complete. Visit:");
  console.log("  http://localhost:1337/explore");
  console.log(`  http://localhost:1337/read/${a1.resource?.slug}`);
  console.log(`  http://localhost:1337/watch/${vid?.slug}`);
  console.log(`  http://localhost:1337/r/${vid?.slug}`);
  console.log("  http://localhost:1337/@superdemo");
}

main()
  .then(async () => {
    await mongoose.disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
