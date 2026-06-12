<div align="center">

# SuperPage

### **Creator commerce for humans and AI agents, settled in USDC on Arc**

*Creators sell articles per read and videos per second. AI agents buy autonomously via x402 (HTTP 402). Every payment settles in USDC on Arc in under a second.*

[![Arc Testnet](https://img.shields.io/badge/Arc-Testnet-00D4AA)](https://testnet.arcscan.app)
[![x402 Protocol](https://img.shields.io/badge/x402-Enabled-blue)](https://x402.org)
[![USDC Native Gas](https://img.shields.io/badge/Gas-USDC-2775CA)](https://www.circle.com)
[![MCP Protocol](https://img.shields.io/badge/MCP-Integrated-purple)](https://modelcontextprotocol.io)
[![OpenClaw](https://img.shields.io/badge/OpenClaw-Skill-orange)](https://openclaw.ai)

**Lepton Agents Hackathon (Canteen x Circle x Arc)**
RFB 4: Streaming and Continuous Payments · RFB 6: Creator and Publisher Monetization

[Live Demo](https://superpa.ge) · [Documentation](#documentation) · [Streaming Protocol](#streaming-protocol-walkthrough)

</div>

---

## What It Is

SuperPage is a creator marketplace where humans AND AI agents buy and sell digital resources through x402 (HTTP 402) USDC payments. Creators publish articles in a Notion-like editor and upload videos that transcode to HLS; buyers (a person with a wallet, or an agent with a private key) pay per read or per second watched. On Arc, USDC is the native gas token, so the entire economy (payments, gas, payouts, refunds) runs on a single stable unit of account, and settlement lands in under a second.

## Why Nanopayments

A lepton is the smallest unit of matter that still does work; a nanopayment is the smallest unit of commerce that still does work, and it only becomes practical when settlement is sub-second, sub-cent, and denominated in the same token as gas. Arc makes the lepton-sized payment (a fraction of a cent for one second of video) economically real, so pricing can finally match consumption instead of approximating it with subscriptions.

## What's New for This Hackathon

Previously SuperPage was an agent shopping skill. For Lepton it became a full creator economy:

1. **Arc port**: the whole stack (frontend, backend, SDK, contracts, agent surfaces) now runs on Arc Testnet (chainId 5042002) with native-USDC gas and the ERC-20 USDC facade as the payment token.
2. **Pay-per-second video streaming** (RFB 4): an on-chain payment channel (the `StreamPay` contract) opened with a USDC deposit, advanced by off-chain signed vouchers every second, settled once on close. The viewer is refunded the unwatched remainder.

```
   Viewer                       SuperPage                    StreamPay (Arc)
     │                              │                              │
     │ 1. openSession(creator,      │                              │
     │    rate, sessionKey)         │                              │
     │    + USDC deposit ───────────┼─────────────────────────────>│ lock USDC
     │                              │                              │
     │ 2. play /watch/[slug] ──────>│ serve HLS segments           │
     │                              │                              │
     │ 3. every second:             │                              │
     │    signed voucher ──────────>│ verify sig, gate next        │
     │    (off-chain, free)         │ segment, track amountOwed    │
     │         ... x N seconds ...  │                              │
     │                              │                              │
     │ 4. stop watching ───────────>│ 5. closeSession(id,          │
     │                              │    amountOwed, sig) ────────>│ pay creator,
     │                              │                              │ refund viewer
     │                              │                              │
     │ (safety valve: viewer can reclaimExpired(id) for the full   │
     │  deposit after 24h if the platform never settles)           │
```

3. **Notion-like publishing** (RFB 6): a BlockNote block editor for articles with free preview blocks, per-read pricing, and a clean reading surface at `/read/[slug]`.
4. **Gumroad-style storefront**: creator profiles, product detail pages at `/r/[slug]`, cover images, and one-click x402 checkout for humans and agents alike.

Honest scope: this is a hackathon build running on Arc Testnet. Nothing here touches mainnet funds.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                     AGENT SURFACES                               │
│                                                                  │
│   ┌─────────────┐   ┌─────────────┐   ┌─────────────────┐      │
│   │  Telegram    │   │   Claude    │   │  Standalone CLI  │      │
│   │  (OpenClaw)  │   │   Desktop   │   │  (superio)       │      │
│   └──────┬──────┘   └──────┬──────┘   └───────┬─────────┘      │
│          │                 │                   │                  │
│     OpenClaw Skill      MCP Server        AI SDK (Vercel)        │
│     (CLI exec)         (stdio/JSON-RPC)   (Anthropic/OpenAI/     │
│                                            Google)               │
│          └─────────────────┼───────────────────┘                 │
│                            │                                     │
│                            ▼                                     │
│              ┌──────────────────────────┐                        │
│              │  superpage-x402.js       │                        │
│              │  (CLI + MCP dual-mode)   │                        │
│              │                          │                        │
│              │  • preview (price only)  │                        │
│              │  • request (pay + fetch) │                        │
│              │  • list-resources        │                        │
│              │  • search                │                        │
│              │  • wallet                │                        │
│              │  • send                  │                        │
│              │  • buy (Shopify)         │                        │
│              └────────────┬─────────────┘                        │
│                           │                                      │
└───────────────────────────┼──────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│                     SUPERPAGE PLATFORM                           │
│                                                                  │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐     │
│   │ x402 Gateway │  │  A2A Server  │  │  Stream Gateway  │     │
│   │ (HTTP 402)   │  │  (JSON-RPC)  │  │ (vouchers + HLS) │     │
│   └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘     │
│          │                 │                    │                │
│   ┌──────┴─────────────────┴────────────────────┴──────────┐    │
│   │              Express Backend (TypeScript)               │    │
│   │  • Resource marketplace (articles, video, APIs, files)  │    │
│   │  • ffmpeg HLS transcoding pipeline                      │    │
│   │  • Payment verification (on-chain)                      │    │
│   │  • ERC-8004 identity & reputation                       │    │
│   │  • MongoDB state management                             │    │
│   └──────────────────────┬─────────────────────────────────┘    │
│                          │                                       │
│   ┌──────────────────────┴─────────────────────────────────┐    │
│   │              Next.js Frontend                           │    │
│   │  • Notion-like article editor (BlockNote)               │    │
│   │  • Pay-per-second video player (/watch/[slug])          │    │
│   │  • Gumroad-style storefront (/r/[slug])                 │    │
│   │  • Creator dashboard, wallet connect (RainbowKit)       │    │
│   └────────────────────────────────────────────────────────┘    │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
                            │
                            ▼
                ┌───────────────────────┐
                │  Arc Testnet          │
                │                       │
                │  • USDC payments      │
                │  • USDC IS the gas    │
                │  • Chain ID: 5042002  │
                │  • Sub-second blocks  │
                │  • StreamPay channel  │
                │  • On-chain receipts  │
                └───────────────────────┘
```

---

## Quick Start

### Prerequisites

- Node.js 22+, pnpm 8+, MongoDB, ffmpeg (for video transcoding)
- A wallet funded with Arc Testnet USDC from `https://faucet.circle.com` (select Arc Testnet; USDC covers both gas and payments, since gas IS USDC)

### Run

```bash
git clone https://github.com/AIProjects402/superpage.git
cd superpage
pnpm install
./dev.sh
```

This starts:
- **Frontend**: http://localhost:1337
- **Backend**: http://localhost:2337

Key environment variables (see `.env.production.example`):

```bash
X402_CHAIN=arc-testnet
X402_CURRENCY=USDC
ARC_RPC_URL=https://rpc.testnet.arc.network   # optional override
WALLET_PRIVATE_KEY=0x...
X402_RECIPIENT_ADDRESS=0x...
STREAMPAY_ADDRESS=0x...                        # set after contract deploy
NEXT_PUBLIC_STREAMPAY_ADDRESS=0x...            # same address, frontend build arg
```

---

## Network Details

| Property | Value |
|----------|-------|
| **Network** | Arc Testnet |
| **Chain ID** | 5042002 |
| **RPC URL** | `https://rpc.testnet.arc.network` |
| **Explorer** | `https://testnet.arcscan.app` |
| **Native Gas** | USDC (native balances use 18 decimals) |
| **Payment Token** | USDC ERC-20 facade `0x3600000000000000000000000000000000000000` (6 decimals) |
| **EURC** | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` |
| **Faucet** | `https://faucet.circle.com` (select Arc Testnet) |
| **Circle Gateway (roadmap)** | GatewayWallet `0x0077777d7EBA4688BDeF3E311b846F25870A19B9` for batched nanopayments, not yet integrated |

Note the dual representation of USDC on Arc: the native gas token uses 18-decimal accounting at the EVM level, while the ERC-20 facade at `0x3600...0000` uses the canonical 6 decimals and is what x402 payments transfer.

---

## Streaming Protocol Walkthrough

The pay-per-second flow uses a payment channel so that N seconds of video cost exactly one deposit transaction and one settlement transaction, regardless of N.

1. **Open**: the viewer calls `openSession(creator, ratePerSecond, sessionKey)` on `StreamPay`, sending the deposit as `msg.value` in native USDC (covers the full video: `pricePerSecondUsdc * durationSeconds`). `sessionKey` is an ephemeral key generated in the browser (or by the agent) just for this session, so the main wallet signs exactly once.
2. **Register**: the client calls `POST /stream/session/register` with `{ resourceSlug, sessionId }`; the backend reads the session straight from the contract (`getSession`), verifies the deposit and rate, and unlocks HLS playback at `/watch/[slug]`.
3. **Tick**: every second of playback, the session key signs a voucher off-chain and sends it via `POST /stream/session/:sessionId/heartbeat` with `{ amountOwedWei, secondsWatched, signature }`. The voucher digest is:
   `keccak256(abi.encodePacked("SUPERPAGE_STREAM", chainId, contract, sessionId, amountOwed))`, signed eth_sign style by the session key. No gas, no latency, no on-chain traffic.
4. **Gate**: the backend verifies each voucher signature and monotonically increasing `amountOwed` (bounded by the deposit and elapsed wall time) before serving the next HLS segment. Stop paying, and the stream stops.
5. **Close**: when the viewer stops (or the video ends), `POST /stream/session/:sessionId/close` triggers a single on-chain `closeSession(sessionId, amountOwed, signature)`. The contract verifies the highest voucher, pays the creator exactly what was watched, and refunds the unwatched remainder to the viewer. The client polls `GET /stream/session/:sessionId` for the settlement receipt.
6. **Safety valve**: if the platform disappears and never settles, the viewer calls `reclaimExpired(sessionId)` after 24 hours and recovers the full deposit. Funds are never stranded.

Articles use simple one-shot x402: free preview blocks render at `/read/[slug]`, then a single USDC payment unlocks the full piece.

---

## Agent Surfaces

The agent tooling is unchanged from the original build and works on Arc as-is:

- **MCP Server** (Claude Desktop): 12+ tools (`x402_list_resources`, `x402_request`, `x402_wallet`, `x402_send`, `x402_buy`, ...) over stdio/JSON-RPC
- **A2A Protocol**: discoverable agent card at `/.well-known/agent.json`, JSON-RPC 2.0 endpoint at `/a2a`, ERC-8004 registration at `/.well-known/agent-registration.json`
- **OpenClaw Skill / CLI**: `list-resources`, `search`, `preview`, `request`, `wallet`, `send`, plus Shopify `buy`
- **Standalone AI agent** (`pnpm agent`): multi-LLM CLI (Anthropic/OpenAI/Google) that discovers, confirms, and pays autonomously
- **Skill manifest**: served live at `/skill.md` so any agent can self-onboard

The flow every surface follows: discover, preview the price (the 402 response IS the price quote), confirm with the user, pay USDC on Arc, deliver content plus a tx-hash receipt.

---

## RFB Alignment

### RFB 4: Streaming and Continuous Payments

- True per-second value transfer backed by an on-chain channel, not polling-based billing
- One deposit + one settlement on-chain; thousands of signed vouchers off-chain
- Viewer-protective: unwatched USDC is refunded at settlement, and a 24h `reclaimExpired` recovers the deposit if the platform vanishes
- Works for human viewers (browser, ephemeral session key) and AI agents (programmatic session key) identically

### RFB 6: Creator and Publisher Monetization

- Creators publish in minutes: Notion-like editor for articles, drag-and-drop video upload with server-side HLS transcoding
- Pricing that matches consumption: per-read articles, per-second video, free previews to drive conversion
- Earnings settle directly to the creator's wallet in USDC, no payout schedule, no platform custody
- AI agents are first-class customers AND first-class creators: an agent can publish a guide and earn USDC from other agents

---

## Why This Could Win (Traction Hooks)

- **Working end-to-end on testnet today**: connect a wallet, fund it at faucet.circle.com, watch a video, and inspect the open/settle transactions on Arcscan
- **Novel protocol use**: x402 for one-shot purchases plus a voucher-based payment channel for continuous payments, on a chain where the payment asset is also the gas asset
- **Agent-native from day one**: MCP, A2A, ERC-8004, and a served skill manifest mean any agent framework can transact without custom integration
- **Clear path beyond the hackathon**: Circle Gateway batch nanopayments (contracts already on Arc), EURC pricing, and mainnet settlement are direct extensions of the existing channel design

---

## Project History

SuperPage won the **Coinbase x402 track at the SURGE x OpenClaw Hackathon 2026** as an agent payment skill, and previously ran on Mezo (Bitcoin economic layer) with MUSD payments. For the Lepton Agents Hackathon it was ported to Arc and extended from "agents can buy things" to a full creator economy with continuous payments. Legacy Mezo support is documented in [docs/mezo.md](docs/mezo.md).

---

## Monorepo Structure

```
superpage/
├── packages/
│   ├── frontend/          Next.js 16 + React 19 + Tailwind 4 (port 1337)
│   ├── backend/           Express + MongoDB + x402 gateway + A2A (port 2337)
│   ├── mcp-client/        MCP server + CLI (superpage-x402.js)
│   ├── ai-agent/          Standalone AI agent (Anthropic/OpenAI/Google)
│   ├── x402-sdk-eth/      Payment verification SDK (viem)
│   └── contracts/         Hardhat v3 + Solidity 0.8.24 (StreamPay, ERC-8004)
├── dev.sh                 Start all services
└── package.json           pnpm workspace root
```

---

## API Endpoints

```bash
# Health
GET  /health

# Resources
GET  /x402/resources                    # List all resources
GET  /x402/resource/:slug               # Access resource (402 if unpaid)

# Streaming (payment channel)
POST /stream/session/register           # Register an on-chain session, unlock playback
POST /stream/session/:id/heartbeat      # Submit a signed per-second voucher
POST /stream/session/:id/close          # Trigger on-chain settlement
GET  /stream/session/:id                # Session status / settlement receipt
GET  /stream/meta/:slug                 # Video metadata (rate, duration, free preview)

# Consumption surfaces (frontend)
GET  /watch/:slug                       # Pay-per-second video player
GET  /read/:slug                        # Article reader (free preview, then 402)
GET  /r/:slug                           # Product detail page

# Agent Discovery
GET  /.well-known/agent.json            # A2A Agent Card
GET  /.well-known/agent-registration.json  # ERC-8004 Registration
GET  /skill.md                          # Machine-readable skill manifest

# A2A / MCP
POST /a2a                               # JSON-RPC 2.0 endpoint
POST /mcp/universal                     # MCP server endpoint
```

---

## Security

- **Spending caps**: `MAX_AUTO_PAYMENT` limits per-transaction agent spend
- **Confirmation flow**: agents preview price and ask before paying
- **Non-custodial**: wallets and session keys stay client-side; creators are paid directly
- **On-chain verification**: every payment and every settlement verified against Arc RPC
- **Channel safety**: vouchers are scoped to one session id and one contract via the digest preimage; deposits are reclaimable after 24h

---

## Documentation

- **Docs site**: http://localhost:1337/docs (Getting Started, API, SDK, MCP, OpenClaw, AI Agents)
- **Agent manifest**: `SKILL.md` (also served at `/skill.md`)
- **Agent card**: `agent.json` / `GET /.well-known/agent.json`
- **Chain guides**: [docs/arc.md](docs/arc.md), [docs/mezo.md](docs/mezo.md) (legacy), [docs/STACKS.md](docs/STACKS.md)

---

<div align="center">

**SuperPage**: creator commerce for humans and AI agents, one second at a time.

Built for the Lepton Agents Hackathon by Canteen, with Circle and Arc.

</div>
