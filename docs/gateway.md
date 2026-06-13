# Circle Gateway nanopayment batching (streaming settlement)

SuperPage settles pay-per-second streaming through StreamPay payment channels:
each viewing session closes with its own on-chain `closeSession` transaction.
That is the default and is unchanged.

This document covers an **additive, feature-flagged** alternative: settling many
sessions through **Circle Gateway** in batches. It demonstrates Circle's
nanopayment tooling and is judged separately. It is off by default and does not
touch the StreamPay path.

## What Circle Gateway is

Circle Gateway lets a payer deposit USDC once into a non-custodial
`GatewayWallet` contract, then sign many gasless off-chain USDC authorizations
(EIP-3009 `transferWithAuthorization`). A facilitator collects those
authorizations and settles them as a single on-chain batch. This makes sub-cent
("nano") payments economically viable: a creator with N concurrent viewers pays
gas roughly once instead of N times.

Reference implementation: <https://github.com/circlefin/arc-nanopayments>
Docs: <https://developers.circle.com/gateway/nanopayments>

## Addresses and identifiers (Arc testnet)

| Thing | Value |
| --- | --- |
| GatewayWallet | `0x0077777d7EBA4688BDeF3E311b846F25870A19B9` |
| GatewayMinter | `0x0022222ABE238Cc2C7Bb1f21003F0a260052475B` |
| USDC ERC-20 facade | `0x3600000000000000000000000000000000000000` (6 decimals) |
| Circle domain (Arc testnet) | `26` |
| Circle domain (Base Sepolia) | `6` |
| Gateway REST API (testnet) | `https://gateway-api-testnet.circle.com` |

The GatewayWallet/GatewayMinter addresses are the same across EVM testnets.
Circle "domains" are CCTP-style identifiers, not EVM chain ids.

## How to enable

All Gateway behaviour is gated behind one environment flag:

```
GATEWAY_BATCHING=true        # default false; turns the path on
```

Optional related env:

```
GATEWAY_WALLET_ADDRESS=0x... # override the GatewayWallet address
GATEWAY_MINTER_ADDRESS=0x... # override the GatewayMinter address
GATEWAY_API_BASE=https://... # override the REST base
OPERATOR_ADDRESS=0x...       # address whose Gateway balance the API reads by default
GATEWAY_LIVE_SUBMIT=1        # the single switch that crosses the network boundary
                             # (see "Going live" below). Off by default.
```

With `GATEWAY_BATCHING` unset or false, `stream-settlement.ts` never calls into
the Gateway module: the `isGatewayEnabled()` branch is skipped and settlement is
byte-identical to the StreamPay channel close path.

## What is live vs scaffolded

| Capability | Status | Notes |
| --- | --- | --- |
| Read operator/creator Gateway balance (on-chain `availableBalance`) | **Live** | viem read against Arc using the backend chain config |
| Read Gateway balance via Circle `/v1/balances` REST | **Live** | best-effort; falls back to the on-chain figure |
| "Needs deposit" guard before settling | **Live** | settlement refuses if the operator has no Gateway deposit |
| Deposit helper (`prepareDeposit`, `/stream/gateway/deposit-plan`) | **Live (prepared, not sent)** | returns the `approve` + `deposit` calls; the backend never broadcasts |
| Aggregate owed amounts per creator and build `/v1/batch/submit` bodies | **Live (construction)** | one EIP-3009 authorization per session, grouped by creator |
| Actually submitting the batch to Circle / settling on-chain | **Scaffolded** | gated behind `GATEWAY_LIVE_SUBMIT=1` AND a real EIP-3009 signature |

### Why submission is scaffolded, not wired

Two reasons, both deliberate:

1. **The voucher format differs.** StreamPay's per-second voucher is an
   `eth_sign` over a custom `keccak256` digest
   (`SUPERPAGE_STREAM | chainId | contract | sessionId | amount`). Circle's batch
   API expects an **EIP-3009 `transferWithAuthorization`** signature (a different
   EIP-712 typed-data structure, signed by the viewer over
   `from/to/value/validAfter/validBefore/nonce`). Producing a real authorization
   requires a viewer-side signing change, which is out of scope for this backend
   task. The `auth.eip3009Auth.signature` field is therefore built but left empty.
2. **No on-chain spending is permitted** in this task. The settlement function
   stops at the network boundary unless `GATEWAY_LIVE_SUBMIT=1`, and even then
   only if every authorization carries a real signature.

So `settleBatch()` always returns the **fully constructed plan** (per-creator
totals, session ids, and the exact `/v1/batch/submit` request bodies) and marks
nothing as settled unless a real submission succeeds. When the Gateway path
declines, `stream-settlement.ts` falls back to the StreamPay close, so a session
is never silently dropped.

## Going live (the exact remaining steps)

1. **Deposit USDC into the GatewayWallet** (one-time, per balance owner). Use the
   prepared calls from `GET /stream/gateway/deposit-plan?usdc=<amount>`:
   - `USDC.approve(GatewayWallet, value)`
   - `GatewayWallet.deposit(USDC, value)`
   `depositFor(USDC, depositor, value)` funds another address's balance.
   Confirm with `GET /stream/gateway/balance` (the `needsDeposit` flag clears).
2. **Produce viewer-side EIP-3009 authorizations.** Change the streaming client
   so the viewer signs an EIP-3009 `transferWithAuthorization` (domain
   `GatewayWalletBatched` / version `1`, `verifyingContract` = GatewayWallet)
   alongside or instead of the StreamPay voucher, and persist
   `from/to/value/validAfter/validBefore/nonce/signature` on the session. Fill
   `GatewayBatchSubmission.auth.eip3009Auth.signature` from that.
3. **Flip `GATEWAY_LIVE_SUBMIT=1`.** With signatures present, `settleBatch()`
   POSTs each authorization to `POST /v1/batch/submit`; Circle verifies it, locks
   the sender balance, queues the tx, and settles the batch on-chain via its
   forwarder. (Circle's `GatewayMinter.gatewayMint(attestationPayload, signature)`
   is what lands the attested batch on the destination chain; the forwarder
   normally calls it for you.)

## Endpoints added (all under `/stream/gateway/*`)

| Method + path | Purpose |
| --- | --- |
| `GET /stream/gateway/status` | flag state, addresses, Circle domain, live-submit state |
| `GET /stream/gateway/balance` | Gateway USDC balance for `?address=`, `?creatorId=`, or the operator |
| `GET /stream/gateway/deposit-plan?usdc=` | prepared (unsent) `approve` + `deposit` calls |
| `POST /stream/gateway/settle-preview` | dry-run: per-creator batch plan for open sessions, sends nothing |

None of these change the existing StreamPay routes. With the flag off,
`settle-preview` returns `409` and the rest are inert reads.

## Code map

- `packages/backend/src/config/gateway.ts` — addresses, minimal ABIs, domains,
  `isGatewayEnabled()`.
- `packages/backend/src/services/gateway-settlement.ts` — balance reads, deposit
  helper, `settleBatch()` (aggregation + construction + guarded submission).
- `packages/backend/src/services/stream-settlement.ts` — optional
  `isGatewayEnabled()` branch in `settle()`; StreamPay path unchanged and default.
- `packages/backend/src/routes/streamRoutes.ts` — the `/stream/gateway/*`
  endpoints.
