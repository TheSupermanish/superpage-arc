#!/usr/bin/env npx tsx
/**
 * Seed Script — Register web3-guide agent and publish articles at 0.001 MUSD.
 *
 * Usage: npx tsx scripts/seed-web3-guide.ts [http://localhost:2337]
 */
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";

const BASE_URL = process.argv[2] || "http://localhost:2337";

interface ResourceDef {
  type: "article";
  name: string;
  description: string;
  priceUsdc: number;
  config: { content: string };
}

const PRICE = 0.001;

const RESOURCES: ResourceDef[] = [
  {
    type: "article",
    name: "What is Web3? A Beginner's Map",
    description: "Plain-English tour of Web3: wallets, chains, contracts, and why on-chain ownership matters.",
    priceUsdc: PRICE,
    config: {
      content: `# What is Web3? A Beginner's Map

Web3 is the read–write–**own** internet. In Web1 you read. In Web2 you read and write — but the platform owns your data, your audience, and your earnings. In Web3 you also *own*: your identity, your assets, your reputation, and your social graph travel with you across apps.

## The four primitives

1. **Wallets** — your keypair is your account. No email, no password reset, no platform lock-in.
2. **Chains** — public ledgers (Ethereum, Bitcoin, Mezo, Solana) that settle transactions without a middleman.
3. **Smart contracts** — programs deployed on-chain that anyone can call. Code is the API; the ledger is the database.
4. **Tokens** — programmable units of value (stablecoins like MUSD, governance tokens, NFTs for unique items).

## Why it matters for agents

Autonomous AI agents can finally *transact*. With protocols like x402 and ERC-8004, an agent has a wallet, an identity, a reputation score, and the ability to pay for what it consumes — or get paid for what it produces. That's the foundation of the agent economy.

## Where to start

- Get a wallet (MetaMask, Rabby, or a smart wallet).
- Fund it on a cheap testnet (Mezo matsnet, Base Sepolia).
- Send your first transaction. Read the explorer. The mental model clicks fast once you do it once.
`,
    },
  },
  {
    type: "article",
    name: "ERC-8004: Agent Identity, Reputation, and Trust",
    description: "How ERC-8004 gives AI agents portable on-chain identities, feedback, and validation across apps.",
    priceUsdc: PRICE,
    config: {
      content: `# ERC-8004 — Identity & Trust for Autonomous Agents

ERC-8004 is a draft standard that gives AI agents what humans take for granted: a stable on-chain identity, an attached reputation, and a way for third parties to validate claims about behavior.

## Three registries

1. **Identity Registry** — mints a unique \`agentId\` tied to an owner address and points to a registration file (services, endpoints, supported trust models).
2. **Reputation Registry** — clients leave on-chain feedback after interactions. Feedback is signed, revocable, and aggregatable.
3. **Validation Registry** — independent validators can attest to specific runs or outputs.

## Why this is a big deal

Without portable identity, every marketplace builds its own siloed reputation. Agents start from zero each time, and bad actors just spin up new accounts. ERC-8004 lets reputation *follow* the agent — and lets buyers gate access by feedback score or validator stamps.

## Concrete flow

1. Agent registers → gets \`agentId\`.
2. Agent serves a request, gets paid.
3. Buyer leaves feedback on-chain referencing the \`agentId\`.
4. Next buyer queries reputation before paying.

It's primitive, public infrastructure for the agent economy.
`,
    },
  },
  {
    type: "article",
    name: "x402: HTTP 402 Payment Required, Reborn",
    description: "How the x402 protocol turns HTTP 402 into a working pay-per-request standard for agents and APIs.",
    priceUsdc: PRICE,
    config: {
      content: `# x402 — Putting HTTP 402 to Work

HTTP 402 ("Payment Required") sat unused in the spec for thirty years. x402 finally implements it: a tiny payment handshake any HTTP server can speak, any client (human or agent) can answer.

## The handshake

\`\`\`
Client  → GET /premium-resource
Server  → 402 Payment Required
            { price: 0.001 MUSD, recipient: 0xabc..., chain: mezo-testnet, scheme: "exact" }
Client  → signs an EIP-712 authorization, retries with X-PAYMENT header
Server  → settles on-chain, returns 200 + content
\`\`\`

## Why agents love it

- **No accounts, no API keys** — the wallet is the auth.
- **Per-request pricing** — micro-payments without a subscription contract.
- **Standard headers** — any HTTP library works; no SDK lock-in.
- **Cross-chain** — same protocol on Base, Mezo, Solana, …

## Why creators love it

You can monetize a single endpoint, a single article, a single file, with one line of middleware. No paywall page, no Stripe checkout, no chargebacks.

That's the unlock: pay-per-call infrastructure for the open web.
`,
    },
  },
  {
    type: "article",
    name: "Mezo & MUSD: A Bitcoin-Backed Stablecoin for Micro-Payments",
    description: "What Mezo is, why MUSD exists, and how BTC-backed stablecoins enable agent commerce.",
    priceUsdc: PRICE,
    config: {
      content: `# Mezo & MUSD — Bitcoin Becomes a Payments Layer

Mezo is an EVM-compatible economic layer for Bitcoin. You bridge BTC, mint **MUSD** (a BTC-backed stablecoin), and transact with EVM tooling — wallets, contracts, RPC — while the collateral lives on Bitcoin.

## Why it matters for agents

Agents want a payment unit that is:
- **Stable** — they shouldn't lose budget to a 10% candle.
- **Cheap** — sub-cent fees so micro-payments make sense.
- **Programmable** — ERC-20 surface, EIP-712 permits, x402-friendly.

MUSD checks every box. Pay 0.001 MUSD for an article; the fee to do so is a fraction of that.

## The flow

1. Lock BTC as collateral on Mezo.
2. Mint MUSD against it.
3. Spend MUSD via x402, A2A, or AP2.
4. Repay MUSD to unlock your BTC.

## Where this is going

Bitcoin becomes the world's reserve collateral; MUSD becomes the spending medium; agents settle billions of small transactions per day. Same model as legacy finance — gold backs dollars, dollars circulate — only programmable and open.
`,
    },
  },
  {
    type: "article",
    name: "A2A & AP2: How Agents Talk and Pay Each Other",
    description: "Tour of the A2A messaging protocol and Google's AP2 payment mandate spec — the rails of the agent economy.",
    priceUsdc: PRICE,
    config: {
      content: `# A2A and AP2 — The Rails Between Agents

If x402 is how agents pay *services*, **A2A** and **AP2** are how agents talk to and pay *each other*.

## A2A (Agent-to-Agent)

A JSON-RPC 2.0 protocol where every agent exposes an \`agent.json\` card describing its capabilities and an endpoint that accepts tasks. Two agents can:

- Exchange messages on a task thread.
- Stream partial outputs.
- Settle payment in-line when a task is gated.

It's HTTP all the way down — no custom transport, no SDK lock-in.

## AP2 (Agent Payments Protocol)

Google's spec for *mandates*: a buyer agent issues a signed intent ("I authorize up to 5 MUSD for groceries this week, from this merchant set"). The seller agent presents a payment mandate matching that intent; the buyer's wallet validates the constraints and settles.

Think of it as OAuth for spend — scoped, revocable, auditable.

## Together

x402 → pay-per-call.
A2A → conversation.
AP2 → bounded spending authority.

Stack them, and an agent can hire another agent, give it a budget, watch it work, and pay only when the output passes validation. That's the agent economy in one breath.
`,
    },
  },
];

async function apiPost(path: string, body: unknown, token?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE_URL}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(`${path} failed: ${(data as any).error || res.statusText}`);
  return data as Record<string, any>;
}

async function apiPut(path: string, body: unknown, token: string) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${path} failed: ${(data as any).error || res.statusText}`);
  return data as Record<string, any>;
}

async function main() {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  const walletAddress = account.address;

  console.log(`\nweb3-guide  wallet ${walletAddress}`);

  const { nonce, message } = await apiPost("/api/auth/nonce", { walletAddress }) as { nonce: string; message: string };
  const signature = await account.signMessage({ message });
  const verify = await apiPost("/api/auth/verify", { walletAddress, signature, nonce });
  const token = verify.token as string;
  console.log("  authenticated");

  await apiPut("/api/auth/me", {
    username: "web3-guide",
    displayName: "Web3 Guide",
    bio: "Plain-English explainers for the agent economy — wallets, chains, x402, ERC-8004, Mezo/MUSD, and A2A/AP2.",
    website: "https://superpa.ge/web3-guide",
    socialLinks: { twitter: "https://twitter.com/web3guide" },
    isPublic: true,
    showStats: true,
  }, token);
  console.log("  profile set");

  for (const r of RESOURCES) {
    const res = await apiPost("/api/resources", {
      type: r.type,
      name: r.name,
      description: r.description,
      priceUsdc: r.priceUsdc,
      config: r.config,
      isPublic: true,
    }, token);
    const slug = (res.resource as any).slug;
    console.log(`  + ${r.priceUsdc} MUSD  ${r.name}  → /${slug}`);
  }

  console.log(`\nDone. Profile: ${BASE_URL.replace(":2337", ":1337")}/web3-guide`);
  console.log(`private key (save if you want to manage this agent later): ${privateKey}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
