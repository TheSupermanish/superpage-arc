import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  CHAIN_REGISTRY,
  TOKEN_DECIMALS,
  DEFAULT_NETWORK,
  DEFAULT_ASSET,
  SPAY_SCHEME,
  isValidNetwork,
  getChainMetadata,
  getChainId,
  isNativeToken,
  getTokenDecimalsForNetwork,
  getTokenAddressForNetwork,
  getAvailableTokens,
  getDefaultPaymentToken,
  getCurrencyDisplayName,
  getSupportedNetworks,
  getEnabledNetworks,
  getChainConfig,
  getTxExplorerUrl,
  type NetworkId,
} from "../../config/chain-config.js";

describe("Module constants", () => {
  it("DEFAULT_NETWORK is a valid supported network", () => {
    expect(isValidNetwork(DEFAULT_NETWORK)).toBe(true);
    expect(["arc-testnet", "mezo", "mezo-testnet"]).toContain(DEFAULT_NETWORK);
  });

  it("DEFAULT_ASSET is USDC (Arc native stablecoin)", () => {
    expect(DEFAULT_ASSET).toBe("USDC");
  });

  it("exports SPAY_SCHEME", () => {
    expect(SPAY_SCHEME).toBe("spay");
  });
});

describe("CHAIN_REGISTRY (Arc + Base + Mezo)", () => {
  it("contains Arc testnet, Base Sepolia, and the two Mezo networks", () => {
    expect(Object.keys(CHAIN_REGISTRY).sort()).toEqual([
      "arc-testnet",
      "base-sepolia",
      "mezo",
      "mezo-testnet",
    ]);
  });

  it("has Base Sepolia enabled with USDC and ETH gas, no streaming", () => {
    const base = CHAIN_REGISTRY["base-sepolia"];
    expect(base.chainId).toBe(84532);
    expect(base.nativeToken.symbol).toBe("ETH");
    expect(base.tokens.USDC?.address).toBe("0x036CbD53842c5426634e7929541eC2318f3dCF7e");
    expect(base.tokens.USDC?.decimals).toBe(6);
    expect(base.enabled).toBe(true);
    expect(base.supportsStreaming).toBe(false);
  });

  it("has Arc testnet with native-USDC gas and the ERC-20 facade as payment token", () => {
    const arc = CHAIN_REGISTRY["arc-testnet"];
    expect(arc.chainId).toBe(5042002);
    expect(arc.isTestnet).toBe(true);
    expect(arc.nativeToken.symbol).toBe("USDC");
    expect(arc.nativeToken.decimals).toBe(18); // native balance scale
    expect(arc.defaultPaymentToken).toBe("USDC");
    expect(arc.tokens.USDC?.address).toBe("0x3600000000000000000000000000000000000000");
    expect(arc.tokens.USDC?.decimals).toBe(6); // ERC-20 facade scale
    expect(arc.explorerUrl).toBe("https://testnet.arcscan.app");
  });

  it("has Mezo mainnet with MUSD as default payment token", () => {
    const mezo = CHAIN_REGISTRY["mezo"];
    expect(mezo.chainId).toBe(31612);
    expect(mezo.isTestnet).toBe(false);
    expect(mezo.nativeToken.symbol).toBe("BTC");
    expect(mezo.defaultPaymentToken).toBe("MUSD");
    expect(mezo.tokens.MUSD?.address).toBe("0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186");
  });

  it("has Mezo testnet (matsnet) with MUSD", () => {
    const matsnet = CHAIN_REGISTRY["mezo-testnet"];
    expect(matsnet.chainId).toBe(31611);
    expect(matsnet.isTestnet).toBe(true);
    expect(matsnet.nativeToken.symbol).toBe("BTC");
    expect(matsnet.defaultPaymentToken).toBe("MUSD");
    expect(matsnet.tokens.MUSD?.address).toBe("0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503");
  });
});

describe("isValidNetwork", () => {
  it("accepts supported networks", () => {
    expect(isValidNetwork("arc-testnet")).toBe(true);
    expect(isValidNetwork("mezo")).toBe(true);
    expect(isValidNetwork("mezo-testnet")).toBe(true);
  });

  it("rejects removed chains and bogus values", () => {
    expect(isValidNetwork("mainnet")).toBe(false);
    expect(isValidNetwork("flow")).toBe(false);
    expect(isValidNetwork("bogus")).toBe(false);
    expect(isValidNetwork("")).toBe(false);
  });
});

describe("getChainMetadata", () => {
  it("returns metadata for arc-testnet", () => {
    const meta = getChainMetadata("arc-testnet");
    expect(meta.chainId).toBe(5042002);
    expect(meta.name).toContain("Arc");
  });

  it("throws for invalid network", () => {
    expect(() => getChainMetadata("bogus" as NetworkId)).toThrow();
  });
});

describe("getChainId", () => {
  it("returns chain IDs", () => {
    expect(getChainId("arc-testnet")).toBe(5042002);
    expect(getChainId("mezo")).toBe(31612);
    expect(getChainId("mezo-testnet")).toBe(31611);
  });
});

describe("isNativeToken", () => {
  it("only BTC takes the native-transfer path", () => {
    // On Arc, USDC is the gas token but payments go through its ERC-20
    // facade, so it must NOT be treated as native here.
    expect(isNativeToken("BTC")).toBe(true);
    expect(isNativeToken("MUSD")).toBe(false);
    expect(isNativeToken("USDC")).toBe(false);
  });
});

describe("getTokenDecimalsForNetwork", () => {
  it("USDC has 6 decimals on Arc (ERC-20 facade)", () => {
    expect(getTokenDecimalsForNetwork("arc-testnet", "USDC")).toBe(6);
  });

  it("EURC has 6 decimals on Arc", () => {
    expect(getTokenDecimalsForNetwork("arc-testnet", "EURC")).toBe(6);
  });

  it("BTC has 18 decimals (on Mezo)", () => {
    expect(getTokenDecimalsForNetwork("mezo-testnet", "BTC")).toBe(18);
  });

  it("MUSD has 18 decimals", () => {
    expect(getTokenDecimalsForNetwork("mezo-testnet", "MUSD")).toBe(18);
  });
});

describe("getTokenAddressForNetwork", () => {
  it("returns the USDC system-contract facade on Arc", () => {
    expect(getTokenAddressForNetwork("arc-testnet", "USDC")).toBe(
      "0x3600000000000000000000000000000000000000",
    );
  });

  it("returns null for native BTC", () => {
    expect(getTokenAddressForNetwork("mezo-testnet", "BTC")).toBeNull();
  });

  it("returns the MUSD address on matsnet", () => {
    expect(getTokenAddressForNetwork("mezo-testnet", "MUSD")).toBe("0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503");
  });
});

describe("getAvailableTokens", () => {
  it("includes USDC + EURC on Arc", () => {
    const tokens = getAvailableTokens("arc-testnet");
    expect(tokens).toContain("USDC");
    expect(tokens).toContain("EURC");
  });

  it("includes BTC + MUSD on matsnet", () => {
    const tokens = getAvailableTokens("mezo-testnet");
    expect(tokens).toContain("BTC");
    expect(tokens).toContain("MUSD");
  });
});

describe("getDefaultPaymentToken", () => {
  it("returns USDC on Arc and MUSD on Mezo", () => {
    expect(getDefaultPaymentToken("arc-testnet")).toBe("USDC");
    expect(getDefaultPaymentToken("mezo")).toBe("MUSD");
    expect(getDefaultPaymentToken("mezo-testnet")).toBe("MUSD");
  });
});

describe("getCurrencyDisplayName", () => {
  it("returns symbol unchanged (no displayCurrency override)", () => {
    expect(getCurrencyDisplayName("arc-testnet", "USDC")).toBe("USDC");
    expect(getCurrencyDisplayName("mezo-testnet", "MUSD")).toBe("MUSD");
  });
});

describe("getSupportedNetworks", () => {
  it("returns Arc + Base + Mezo networks", () => {
    const networks = getSupportedNetworks();
    expect(networks.sort()).toEqual(["arc-testnet", "base-sepolia", "mezo", "mezo-testnet"]);
  });
});

describe("getEnabledNetworks", () => {
  it("returns Arc first, then Base (Mezo excluded)", () => {
    const enabled = getEnabledNetworks();
    expect(enabled).toEqual(["arc-testnet", "base-sepolia"]);
  });
});

describe("getChainConfig (env-driven)", () => {
  const originalEnv = process.env;
  beforeEach(() => { process.env = { ...originalEnv }; });
  afterEach(() => { process.env = originalEnv; });

  it("defaults to arc-testnet with USDC", () => {
    delete process.env.X402_CHAIN;
    delete process.env.X402_CURRENCY;
    delete process.env.X402_TOKEN_ADDRESS;
    delete process.env.X402_TOKEN_DECIMALS;
    const config = getChainConfig();
    expect(config.network).toBe("arc-testnet");
    expect(config.chainId).toBe(5042002);
    expect(config.isTestnet).toBe(true);
    expect(config.currency).toBe("USDC");
    expect(config.tokenAddress).toBe("0x3600000000000000000000000000000000000000");
    expect(config.tokenDecimals).toBe(6);
  });

  it("respects X402_CHAIN=mezo (mainnet)", () => {
    process.env.X402_CHAIN = "mezo";
    delete process.env.X402_CURRENCY;
    const config = getChainConfig();
    expect(config.network).toBe("mezo");
    expect(config.chainId).toBe(31612);
  });

  it("falls back to the default network for unknown network", () => {
    process.env.X402_CHAIN = "nonexistent";
    const config = getChainConfig();
    expect(isValidNetwork(config.network)).toBe(true);
  });

  it("respects X402_CURRENCY env var", () => {
    process.env.X402_CURRENCY = "EURC";
    const config = getChainConfig();
    expect(config.currency).toBe("EURC");
  });

  it("respects X402_TOKEN_DECIMALS env var", () => {
    process.env.X402_TOKEN_DECIMALS = "8";
    const config = getChainConfig();
    expect(config.tokenDecimals).toBe(8);
  });
});

describe("Convenience functions", () => {
  const originalEnv = process.env;
  beforeEach(() => { process.env = { ...originalEnv }; });
  afterEach(() => { process.env = originalEnv; });

  it("getTxExplorerUrl builds a tx URL using current env", () => {
    process.env.X402_CHAIN = "arc-testnet";
    expect(getTxExplorerUrl("0xabc")).toBe("https://testnet.arcscan.app/tx/0xabc");
  });
});

describe("TOKEN_DECIMALS", () => {
  it("contains the supported payment and gas tokens", () => {
    expect(TOKEN_DECIMALS.BTC).toBe(18);
    expect(TOKEN_DECIMALS.ETH).toBe(18);
    expect(TOKEN_DECIMALS.MUSD).toBe(18);
    expect(TOKEN_DECIMALS.USDC).toBe(6);
    expect(TOKEN_DECIMALS.EURC).toBe(6);
  });
});
