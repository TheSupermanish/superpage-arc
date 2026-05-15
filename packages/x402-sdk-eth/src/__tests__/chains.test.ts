import { describe, it, expect } from "vitest";
import {
  CHAIN_REGISTRY,
  getSupportedNetworks,
  isValidNetwork,
  getChainMetadata,
  getChainId,
  getViemChain,
  getRpcUrl,
  getExplorerUrl,
  getTxExplorerUrl,
  isNativeToken,
  getTokenDecimals,
  getTokenAddress,
  getAvailableTokens,
  getDefaultPaymentToken,
  getNetworkByChainId,
  getTestnetNetworks,
  getMainnetNetworks,
  CHAINS,
  CHAIN_IDS,
  TOKEN_ADDRESSES,
  TOKEN_DECIMALS,
  mezoMainnet,
  mezoTestnet,
} from "../chains";

describe("CHAIN_REGISTRY (Mezo only)", () => {
  it("contains exactly the two Mezo networks", () => {
    expect(Object.keys(CHAIN_REGISTRY).sort()).toEqual(["mezo", "mezo-testnet"]);
  });

  it("getSupportedNetworks returns both Mezo networks", () => {
    expect(getSupportedNetworks().sort()).toEqual(["mezo", "mezo-testnet"]);
  });

  it("isValidNetwork accepts mezo / mezo-testnet, rejects others", () => {
    expect(isValidNetwork("mezo")).toBe(true);
    expect(isValidNetwork("mezo-testnet")).toBe(true);
    expect(isValidNetwork("mainnet")).toBe(false);
    expect(isValidNetwork("flow")).toBe(false);
  });

  it("getChainMetadata returns Mezo data with BTC as native token", () => {
    const meta = getChainMetadata("mezo-testnet");
    expect(meta.chainId).toBe(31611);
    expect(meta.nativeToken.symbol).toBe("BTC");
    expect(meta.defaultPaymentToken).toBe("MUSD");
  });

  it("getChainMetadata throws for unsupported network", () => {
    expect(() => getChainMetadata("mainnet" as never)).toThrow();
  });
});

describe("chain ID helpers", () => {
  it("getChainId returns 31612 for mezo mainnet", () => {
    expect(getChainId("mezo")).toBe(31612);
  });
  it("getChainId returns 31611 for mezo testnet", () => {
    expect(getChainId("mezo-testnet")).toBe(31611);
  });
  it("getNetworkByChainId maps both ways", () => {
    expect(getNetworkByChainId(31612)).toBe("mezo");
    expect(getNetworkByChainId(31611)).toBe("mezo-testnet");
    expect(getNetworkByChainId(1)).toBeNull();
  });
});

describe("RPC / explorer helpers", () => {
  it("getRpcUrl returns Mezo RPCs", () => {
    expect(getRpcUrl("mezo")).toBe("https://mezo.drpc.org");
    expect(getRpcUrl("mezo-testnet")).toBe("https://rpc.test.mezo.org");
  });
  it("getExplorerUrl returns Mezo explorers", () => {
    expect(getExplorerUrl("mezo")).toBe("https://explorer.mezo.org");
    expect(getExplorerUrl("mezo-testnet")).toBe("https://explorer.test.mezo.org");
  });
  it("getTxExplorerUrl builds a tx-specific URL", () => {
    expect(getTxExplorerUrl("mezo-testnet", "0xabc")).toBe("https://explorer.test.mezo.org/tx/0xabc");
  });
});

describe("token helpers", () => {
  it("isNativeToken only matches BTC", () => {
    expect(isNativeToken("BTC")).toBe(true);
    expect(isNativeToken("MUSD")).toBe(false);
    expect(isNativeToken("USDC")).toBe(false);
  });

  it("getTokenDecimals: BTC=18, MUSD=18, USDC=6", () => {
    expect(getTokenDecimals("mezo-testnet", "BTC")).toBe(18);
    expect(getTokenDecimals("mezo-testnet", "MUSD")).toBe(18);
    expect(getTokenDecimals("mezo-testnet", "USDC")).toBe(6);
  });

  it("getTokenAddress returns null for native BTC, address for ERC-20s", () => {
    expect(getTokenAddress("mezo-testnet", "BTC")).toBeNull();
    expect(getTokenAddress("mezo-testnet", "MUSD")).toBe("0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503");
    expect(getTokenAddress("mezo-testnet", "USDC")).toBe("0xc2fa1cff46ee4bde61aa5a97e930fb1c3f8d503c");
  });

  it("getAvailableTokens includes BTC + ERC-20s on matsnet", () => {
    const tokens = getAvailableTokens("mezo-testnet");
    expect(tokens).toContain("BTC");
    expect(tokens).toContain("MUSD");
    expect(tokens).toContain("USDC");
  });

  it("getDefaultPaymentToken returns MUSD on both Mezo networks", () => {
    expect(getDefaultPaymentToken("mezo")).toBe("MUSD");
    expect(getDefaultPaymentToken("mezo-testnet")).toBe("MUSD");
  });
});

describe("mainnet / testnet partitions", () => {
  it("getTestnetNetworks lists matsnet only", () => {
    expect(getTestnetNetworks()).toEqual(["mezo-testnet"]);
  });
  it("getMainnetNetworks lists mezo only", () => {
    expect(getMainnetNetworks()).toEqual(["mezo"]);
  });
});

describe("legacy compatibility exports", () => {
  it("CHAINS has both viem chains", () => {
    expect(CHAINS.mezo).toBe(mezoMainnet);
    expect(CHAINS["mezo-testnet"]).toBe(mezoTestnet);
  });
  it("CHAIN_IDS is correct", () => {
    expect(CHAIN_IDS.mezo).toBe(31612);
    expect(CHAIN_IDS["mezo-testnet"]).toBe(31611);
  });
  it("TOKEN_ADDRESSES contains MUSD entries", () => {
    expect(TOKEN_ADDRESSES.mezo.MUSD).toBeDefined();
    expect(TOKEN_ADDRESSES["mezo-testnet"].MUSD).toBe("0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503");
  });
  it("TOKEN_DECIMALS records 18 for BTC and MUSD, 6 for USDC", () => {
    expect(TOKEN_DECIMALS.BTC).toBe(18);
    expect(TOKEN_DECIMALS.MUSD).toBe(18);
    expect(TOKEN_DECIMALS.USDC).toBe(6);
  });
});

describe("getViemChain", () => {
  it("returns the viem mezo chain", () => {
    expect(getViemChain("mezo")).toBe(mezoMainnet);
    expect(getViemChain("mezo-testnet")).toBe(mezoTestnet);
  });
});
