# Mezo Integration Guide

SuperPage supports **Mezo** — a Bitcoin economic layer with EVM-compatibility — as a payment chain. Native gas is paid in **BTC** and the default x402 payment token is **MUSD** (Mezo's BTC-backed stablecoin). On mainnet, bridged **mUSDC** and **mUSDT** are also available.

## Overview

| Property | Mezo Mainnet | Mezo Testnet (matsnet) |
|---|---|---|
| Network ID | `mezo` | `mezo-testnet` |
| Chain ID | 31612 (`0x7b7c`) | 31611 (`0x7b7b`) |
| Native gas token | BTC (18 decimals) | BTC (18 decimals) |
| Default payment token | MUSD (18 dec) | MUSD (18 dec) |
| RPC URL | `https://mezo.drpc.org` | `https://rpc.test.mezo.org` |
| Block explorer | `https://explorer.mezo.org` | `https://explorer.test.mezo.org` |
| Faucet | — (bridge BTC) | `https://faucet.test.mezo.org` |
| Block time | ~1s (Ignite consensus) | ~1s |

> Note: BTC on Mezo uses **18 decimals**, not the canonical 8 decimals of Bitcoin itself. This is verified on-chain — Mezo's native gas accounting is 18 dec for EVM compatibility.

## Token Contracts

### Mezo Mainnet

| Token | Decimals | Address |
|---|---:|---|
| MUSD (native BTC-backed stablecoin) | 18 | `0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186` |
| mUSDC (bridged Circle USDC) | 6 | `0x04671C72Aab5AC02A03c1098314b1BB6B560c197` |
| mUSDT (bridged Tether) | 6 | `0xeB5a5d39dE4Ea42C2Aa6A57EcA2894376683bB8E` |
| mDAI (bridged DAI) | 18 | `0x1531b6e3d51BF80f634957dF81A990B92dA4b154` |
| BTC (wrapped native) | 18 | `0x7b7C000000000000000000000000000000000000` |

### Mezo Testnet (matsnet)

| Token | Decimals | Address | Notes |
|---|---:|---|---|
| MUSD | 18 | `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503` | Mezo-native stablecoin |
| MockUSDC (SuperPage) | 6 | `0xc2fa1cff46ee4bde61aa5a97e930fb1c3f8d503c` | Mintable test token |

## SuperPage Deployed Contracts (matsnet)

ERC-8004 Trustless Agents + MockUSDC deployed by SuperPage:

| Contract | Address |
|---|---|
| MockUSDC | [`0xc2fa1cff46ee4bde61aa5a97e930fb1c3f8d503c`](https://explorer.test.mezo.org/address/0xc2fa1cff46ee4bde61aa5a97e930fb1c3f8d503c) |
| IdentityRegistry | [`0x92b19730d0b7416f195600489cd9be29e109ebce`](https://explorer.test.mezo.org/address/0x92b19730d0b7416f195600489cd9be29e109ebce) |
| ReputationRegistry | [`0x6a81e89fdb563cdf0d21dc2ea5c18ec4020e596f`](https://explorer.test.mezo.org/address/0x6a81e89fdb563cdf0d21dc2ea5c18ec4020e596f) |
| ValidationRegistry | [`0x70d51bafea51fb2f60a06824c1bc5638e36243a1`](https://explorer.test.mezo.org/address/0x70d51bafea51fb2f60a06824c1bc5638e36243a1) |

## Setup

### 1. Environment

```bash
# packages/backend/.env
X402_CHAIN=mezo-testnet
X402_CURRENCY=MUSD                                  # or USDC for MockUSDC
WALLET_PRIVATE_KEY=0xYOUR_KEY
X402_RECIPIENT_ADDRESS=0xYOUR_PAYOUT_ADDRESS

# packages/mcp-client/.env
X402_CHAIN=mezo-testnet
X402_CURRENCY=MUSD
WALLET_PRIVATE_KEY=0xYOUR_KEY
MAX_AUTO_PAYMENT=10.00

# packages/frontend/.env.local
NEXT_PUBLIC_X402_CHAIN=mezo-testnet
NEXT_PUBLIC_X402_CURRENCY=MUSD

# packages/contracts/.env  (only needed if redeploying)
DEPLOY_PRIVATE_KEY=0xYOUR_KEY
```

### 2. Fund the wallet

1. Generate a fresh EOA (`cast wallet new` or MetaMask)
2. Visit `https://faucet.test.mezo.org` and request testnet BTC
3. Either mint MUSD against your BTC via the Mezo borrow flow, **or** mint MockUSDC by calling `mint(address,uint256)` on the MockUSDC contract directly (it has no access control on testnet)

### 3. Deploy your own contracts (optional)

If you want your own MockUSDC + ERC-8004 instances:

```bash
cd packages/contracts
npx hardhat compile
npx tsx scripts/deploy-mezo.ts            # all 4 contracts
npx tsx scripts/deploy-mezo.ts --skip-musdc   # ERC-8004 only
```

Then paste the printed addresses into:
- `packages/x402-sdk-eth/src/chains.ts` — `mezo-testnet.tokens.USDC`
- `packages/backend/src/config/chain-config.ts` — `mezo-testnet.tokens.USDC`
- `packages/frontend/lib/chain-config.ts` — `USDC_ADDRESSES["mezo-testnet"]`
- `packages/mcp-client/src/config.js` — `TOKEN_ADDRESSES["mezo-testnet"].USDC`
- `packages/backend/src/erc8004/config.ts` — `ERC8004_CONTRACTS.*`
- `packages/ai-agent/src/erc8004/client.ts` — `ERC8004_CONTRACTS.*`

## x402 Payment Flow on Mezo

```
1.  Client requests resource
    GET /x402/resource/weather-api

2.  Backend returns 402 with Mezo-flavored requirements
    {
      "scheme": "spay",
      "network": "mezo-testnet",
      "chainId": 31611,
      "token": "MUSD",
      "amount": "500000000000000000",      // 0.5 MUSD (18 dec)
      "recipient": "0x...",
      "memo": "Weather API access"
    }

3.  Agent sends MUSD via ERC-20 transfer (or BTC if token=BTC)

4.  Client retries with X-PAYMENT header:
    { "transactionHash": "0x...", "network": "mezo-testnet",
      "chainId": 31611, "timestamp": 1747800000 }

5.  Backend verifies on-chain via Mezo RPC (https://rpc.test.mezo.org),
    returns 200 + content.
```

Mezo's ~1-second block time means confirmations come back fast — there's no need for the long polls that some other testnets require.

## Why MUSD as the default payment token

Mezo's whole pitch is "Bitcoin-backed stablecoin" — MUSD is the on-brand choice. Concretely:

- **No deploy needed.** MUSD exists at known addresses on testnet *and* mainnet today.
- **Already 18-decimal.** Matches BTC accounting; nothing odd to handle.
- **BTC-backed.** Aligned with Mezo's value prop — every MUSD is overcollateralized by BTC on Mezo.

MockUSDC remains wired in as the `USDC` slot for `mezo-testnet` for users who want a mintable-on-demand testing token without going through the MUSD borrow flow.

## Switching back to Flow / another chain

Setting `X402_CHAIN=mezo` (mainnet) or any other registered network switches everything — registry, MCP, frontend wallet provider all read from the same config. No code changes required.

## Troubleshooting

### "No BTC balance" on deploy
Hit the faucet at `https://faucet.test.mezo.org` and wait ~1 block.

### "Token MUSD is not supported on mezo-testnet"
Check that the SDK has been rebuilt: `cd packages/x402-sdk-eth && npm run build`. The backend re-exports from `dist/`.

### Frontend won't show Mezo
Restart the Next dev server after env changes — `NEXT_PUBLIC_*` vars are baked at build/start time.

### Payment verification fails
Verify the recipient address in your `.env` matches `X402_RECIPIENT_ADDRESS`. The SDK's `verifyPaymentTransaction()` checks `tx.to === requirements.recipient` for native BTC transfers and parses `Transfer` events for ERC-20 (MUSD / MockUSDC).
