# Arc Integration Guide

SuperPage's default chain is **Arc**, Circle's stablecoin-native L1. The defining property: **USDC is the native gas token**, so a single faucet drip funds both gas and x402 payments, and every price on the platform is denominated in the same stable unit the chain itself runs on.

## Overview

| Property | Arc Testnet |
|---|---|
| Network ID | `arc-testnet` |
| Chain ID | 5042002 |
| Native gas token | USDC (18 decimals at the native EVM level) |
| Default payment token | USDC ERC-20 facade (6 decimals) |
| RPC URL | `https://rpc.testnet.arc.network` |
| Block explorer | `https://testnet.arcscan.app` |
| Faucet | `https://faucet.circle.com` (select Arc Testnet) |
| Settlement | Sub-second |

> Note the dual representation of USDC on Arc: native balances and `msg.value` use **18 decimals**, while the ERC-20 facade at `0x3600...0000` uses the canonical **6 decimals**. x402 payments transfer the ERC-20 facade; gas is paid from the native balance. Both are funded by the same faucet drip.

## Token Contracts

| Token | Decimals | Address | Notes |
|---|---:|---|---|
| USDC (ERC-20 facade over native) | 6 | `0x3600000000000000000000000000000000000000` | Default x402 payment token |
| EURC | 6 | `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a` | Euro stablecoin, roadmap for EUR pricing |

## Circle Gateway (Roadmap)

Circle's Gateway nanopayment contracts exist on Arc and are a direct extension path for batched nanopayments (not yet integrated into SuperPage):

| Contract | Address |
|---|---|
| GatewayWallet | `0x0077777d7EBA4688BDeF3E311b846F25870A19B9` |

## SuperPage Deployed Contracts (Arc Testnet)

Addresses are env-driven and filled in after deploy:

| Contract | Env var | Purpose |
|---|---|---|
| StreamPay | `STREAMPAY_ADDRESS` / `NEXT_PUBLIC_STREAMPAY_ADDRESS` | Payment channel for pay-per-second streaming |
| IdentityRegistry | `ERC8004_IDENTITY_REGISTRY` | ERC-8004 agent identity |
| ReputationRegistry | `ERC8004_REPUTATION_REGISTRY` | ERC-8004 reputation |
| ValidationRegistry | `ERC8004_VALIDATION_REGISTRY` | ERC-8004 validation |

## Setup

### 1. Environment

```bash
# backend (.env)
X402_CHAIN=arc-testnet
X402_CURRENCY=USDC
WALLET_PRIVATE_KEY=0xYOUR_KEY
X402_RECIPIENT_ADDRESS=0xYOUR_PAYOUT_ADDRESS
# ARC_RPC_URL=https://rpc.testnet.arc.network   # optional override
STREAMPAY_ADDRESS=0xSTREAMPAY_CONTRACT_ADDRESS

# frontend (build args)
NEXT_PUBLIC_X402_CHAIN=arc-testnet
NEXT_PUBLIC_X402_CURRENCY=USDC
NEXT_PUBLIC_STREAMPAY_ADDRESS=0xSTREAMPAY_CONTRACT_ADDRESS
```

### 2. Fund a wallet

Go to `https://faucet.circle.com`, select **Arc Testnet**, and paste your address. Amounts arrive as native USDC, immediately usable for gas and convertible 1:1 through the ERC-20 facade for payments.

### 3. Verify

```bash
# chain id should return 0x4cef52 (5042002)
curl -s https://rpc.testnet.arc.network \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}'
```

## StreamPay (Pay-Per-Second Streaming)

The streaming payment channel lives on Arc (contract source: `packages/contracts/contracts/StreamPay.sol`). Summary of the protocol (full walkthrough in the root README):

1. `openSession(creator, ratePerSecond, sessionKey)` with the deposit sent as `msg.value` in native USDC, covering the full video.
2. Off-chain vouchers each second, signed by the ephemeral session key. Digest:
   `keccak256(abi.encodePacked("SUPERPAGE_STREAM", chainId, contract, sessionId, amountOwed))`, signed eth_sign style.
3. `closeSession(sessionId, amountOwed, signature)` once at the end: creator paid for watched seconds, viewer refunded the rest.
4. `reclaimExpired(sessionId)` recovers the full deposit 24h after an unsettled session.

## Code Pointers

- Frontend chain config: `packages/frontend/lib/chains.ts` (`arcTestnet`), `packages/frontend/lib/chain-config.ts`
- Backend chain config: `packages/backend/src/config/chain-config.ts`
- Payment SDK: `packages/x402-sdk-eth`
- Contracts: `packages/contracts` (Hardhat v3, Solidity 0.8.24)

## Legacy Chains

- [Mezo](mezo.md) (BTC gas, MUSD payments): kept for back-compat via `X402_CHAIN=mezo-testnet`
- [Stacks](STACKS.md): experimental SIP-010 support
