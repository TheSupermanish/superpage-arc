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
  getChainConfig,
  getTxExplorerUrl,
  type NetworkId,
} from "../../config/chain-config.js";

describe("Module constants", () => {
  it("DEFAULT_NETWORK is a valid Mezo network", () => {
    expect(isValidNetwork(DEFAULT_NETWORK)).toBe(true);
    expect(["mezo", "mezo-testnet"]).toContain(DEFAULT_NETWORK);
  });

  it("DEFAULT_ASSET is MUSD", () => {
    expect(DEFAULT_ASSET).toBe("MUSD");
  });

  it("exports SPAY_SCHEME", () => {
    expect(SPAY_SCHEME).toBe("spay");
  });
});

describe("CHAIN_REGISTRY (Mezo only)", () => {
  it("contains exactly the two Mezo networks", () => {
    expect(Object.keys(CHAIN_REGISTRY).sort()).toEqual(["mezo", "mezo-testnet"]);
  });

  it("has Mezo mainnet with MUSD as default payment token", () => {
    const mezo = CHAIN_REGISTRY["mezo"];
    expect(mezo.chainId).toBe(31612);
    expect(mezo.isTestnet).toBe(false);
    expect(mezo.nativeToken.symbol).toBe("BTC");
    expect(mezo.defaultPaymentToken).toBe("MUSD");
    expect(mezo.tokens.MUSD?.address).toBe("0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186");
  });

  it("has Mezo testnet (matsnet) with MUSD and MockUSDC", () => {
    const matsnet = CHAIN_REGISTRY["mezo-testnet"];
    expect(matsnet.chainId).toBe(31611);
    expect(matsnet.isTestnet).toBe(true);
    expect(matsnet.nativeToken.symbol).toBe("BTC");
    expect(matsnet.defaultPaymentToken).toBe("MUSD");
    expect(matsnet.tokens.MUSD?.address).toBe("0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503");
    expect(matsnet.tokens.USDC?.address).toBe("0xc2fa1cff46ee4bde61aa5a97e930fb1c3f8d503c");
  });
});

describe("isValidNetwork", () => {
  it("accepts Mezo networks", () => {
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
  it("returns metadata for matsnet", () => {
    const meta = getChainMetadata("mezo-testnet");
    expect(meta.chainId).toBe(31611);
    expect(meta.name).toContain("Mezo");
  });

  it("throws for invalid network", () => {
    expect(() => getChainMetadata("bogus" as NetworkId)).toThrow();
  });
});

describe("getChainId", () => {
  it("returns Mezo chain IDs", () => {
    expect(getChainId("mezo")).toBe(31612);
    expect(getChainId("mezo-testnet")).toBe(31611);
  });
});

describe("isNativeToken", () => {
  it("only BTC is native", () => {
    expect(isNativeToken("BTC")).toBe(true);
    expect(isNativeToken("MUSD")).toBe(false);
    expect(isNativeToken("USDC")).toBe(false);
    expect(isNativeToken("USDT")).toBe(false);
  });
});

describe("getTokenDecimalsForNetwork", () => {
  it("BTC has 18 decimals (on Mezo)", () => {
    expect(getTokenDecimalsForNetwork("mezo-testnet", "BTC")).toBe(18);
  });

  it("MUSD has 18 decimals", () => {
    expect(getTokenDecimalsForNetwork("mezo-testnet", "MUSD")).toBe(18);
  });

  it("USDC (MockUSDC on matsnet) has 6 decimals", () => {
    expect(getTokenDecimalsForNetwork("mezo-testnet", "USDC")).toBe(6);
  });
});

describe("getTokenAddressForNetwork", () => {
  it("returns null for native BTC", () => {
    expect(getTokenAddressForNetwork("mezo-testnet", "BTC")).toBeNull();
  });

  it("returns the MUSD address on matsnet", () => {
    expect(getTokenAddressForNetwork("mezo-testnet", "MUSD")).toBe("0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503");
  });
});

describe("getAvailableTokens", () => {
  it("includes BTC + MUSD on matsnet", () => {
    const tokens = getAvailableTokens("mezo-testnet");
    expect(tokens).toContain("BTC");
    expect(tokens).toContain("MUSD");
    expect(tokens).toContain("USDC");
  });
});

describe("getDefaultPaymentToken", () => {
  it("returns MUSD on both networks", () => {
    expect(getDefaultPaymentToken("mezo")).toBe("MUSD");
    expect(getDefaultPaymentToken("mezo-testnet")).toBe("MUSD");
  });
});

describe("getCurrencyDisplayName", () => {
  it("returns symbol unchanged for Mezo (no displayCurrency override)", () => {
    expect(getCurrencyDisplayName("mezo-testnet", "MUSD")).toBe("MUSD");
    expect(getCurrencyDisplayName("mezo-testnet", "USDC")).toBe("USDC");
  });
});

describe("getSupportedNetworks", () => {
  it("returns the two Mezo networks", () => {
    const networks = getSupportedNetworks();
    expect(networks.sort()).toEqual(["mezo", "mezo-testnet"]);
  });
});

describe("getChainConfig (env-driven)", () => {
  const originalEnv = process.env;
  beforeEach(() => { process.env = { ...originalEnv }; });
  afterEach(() => { process.env = originalEnv; });

  it("defaults to mezo-testnet", () => {
    delete process.env.X402_CHAIN;
    delete process.env.X402_CURRENCY;
    delete process.env.X402_TOKEN_ADDRESS;
    delete process.env.X402_TOKEN_DECIMALS;
    const config = getChainConfig();
    expect(config.network).toBe("mezo-testnet");
    expect(config.chainId).toBe(31611);
    expect(config.isTestnet).toBe(true);
  });

  it("respects X402_CHAIN=mezo (mainnet)", () => {
    process.env.X402_CHAIN = "mezo";
    const config = getChainConfig();
    expect(config.network).toBe("mezo");
    expect(config.chainId).toBe(31612);
  });

  it("falls back to mezo-testnet for unknown network", () => {
    process.env.X402_CHAIN = "nonexistent";
    const config = getChainConfig();
    expect(config.network).toBe("mezo-testnet");
  });

  it("respects X402_CURRENCY env var", () => {
    process.env.X402_CURRENCY = "BTC";
    const config = getChainConfig();
    expect(config.currency).toBe("BTC");
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
    process.env.X402_CHAIN = "mezo-testnet";
    expect(getTxExplorerUrl("0xabc")).toBe("https://explorer.test.mezo.org/tx/0xabc");
  });
});

describe("TOKEN_DECIMALS", () => {
  it("only contains Mezo tokens", () => {
    expect(TOKEN_DECIMALS.BTC).toBe(18);
    expect(TOKEN_DECIMALS.MUSD).toBe(18);
    expect(TOKEN_DECIMALS.USDC).toBe(6);
    expect(TOKEN_DECIMALS.USDT).toBe(6);
    expect(TOKEN_DECIMALS.DAI).toBe(18);
    expect(TOKEN_DECIMALS.ETH).toBeUndefined();
    expect(TOKEN_DECIMALS.sFUEL).toBeUndefined();
  });
});
