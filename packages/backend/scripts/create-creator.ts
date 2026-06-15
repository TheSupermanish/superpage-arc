#!/usr/bin/env npx tsx
/**
 * Create a creator profile through the REAL wallet-auth flow (nonce -> sign ->
 * JWT), claim a username, and publish a few resources (exercising auto-tagging
 * on create). Cosmetic fields (displayName/bio) are set directly in Mongo since
 * there's no public API for them yet.
 *
 * Generates a fresh wallet each run (a brand-new creator), so it's safe to run
 * repeatedly. Prints the public profile URL to open in the UI.
 *
 * Usage: npx tsx scripts/create-creator.ts [username]
 */
import "dotenv/config";
import mongoose from "mongoose";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createWalletClient, http } from "viem";

const BASE = process.env.BUYER_BASE_URL || "http://localhost:2337";
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/x402";
const USERNAME = process.argv[2] || "streampay-labs";

const account = privateKeyToAccount(generatePrivateKey());
const wallet = createWalletClient({ account, transport: http("http://localhost:9") });

async function authToken(): Promise<string> {
  const n = await fetch(`${BASE}/api/auth/nonce`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress: account.address }),
  });
  const { nonce, message } = (await n.json()) as { nonce: string; message: string };
  const signature = await wallet.signMessage({ account, message });
  const v = await fetch(`${BASE}/api/auth/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress: account.address, signature, nonce }),
  });
  const body: any = await v.json();
  const token = body.token || body.jwt || body.accessToken;
  if (!token) throw new Error(`verify returned no token: ${JSON.stringify(body).slice(0, 200)}`);
  return token;
}

async function api(path: string, token: string, method: string, payload?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : {};
}

const RESOURCES = [
  {
    type: "article",
    name: "Streaming money on Arc: a builder's guide",
    description: "How pay-per-second video settles in USDC over a StreamPay channel, with refunds.",
    priceUsdc: 0.05,
    config: { markdown: "# Streaming money on Arc\n\nPay per second, settle in USDC, refund the rest." },
  },
  {
    type: "file",
    name: "USDC Nanopayments Cheatsheet (PDF)",
    description: "One-page reference for x402, payment channels, and Circle Gateway batching.",
    priceUsdc: 0.25,
    config: {},
  },
  {
    type: "api",
    name: "Creator Payout Webhook API",
    description: "Webhook that fires when a creator gets paid; agents subscribe and react.",
    priceUsdc: 0.01,
    config: { upstream_url: "https://example.com/webhook" },
  },
];

async function main() {
  console.log(`Creating creator @${USERNAME} via real wallet auth`);
  console.log("  wallet:", account.address);

  const token = await authToken();
  console.log("  authenticated (JWT acquired)");

  await api("/api/creators/me/username", token, "PUT", { username: USERNAME });
  console.log(`  username claimed: @${USERNAME}`);

  for (const r of RESOURCES) {
    const created = await api("/api/resources", token, "POST", r);
    const res = created.resource || created;
    console.log(`  + ${r.type}: "${r.name}"  tags=[${(res.tags || []).join(", ")}]  /r/${res.slug}`);
  }

  // Cosmetic fields (no public API yet): set straight on the creator doc.
  await mongoose.connect(MONGODB_URI);
  await mongoose.connection.collection("creators").updateOne(
    { walletAddress: account.address.toLowerCase() },
    {
      $set: {
        displayName: "StreamPay Labs",
        bio: "Pay-per-second video and USDC nanopayments on Arc. Built on SuperPage.",
      },
    }
  );
  await mongoose.disconnect();
  console.log("  profile details set (displayName, bio)");

  console.log(`\nDone. Open the profile: ${BASE.replace("2337", "1337")}/${USERNAME}`);
}

main().catch((e) => {
  console.error("create-creator failed:", e.message);
  process.exit(1);
});
