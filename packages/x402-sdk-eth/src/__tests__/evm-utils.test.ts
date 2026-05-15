import { describe, it, expect } from "vitest";
import {
  CHAINS,
  CHAIN_IDS,
  TOKEN_ADDRESSES,
  TOKEN_DECIMALS,
  ERC20_ABI,
  getRpcEndpoint,
  getChainId,
  amountToBaseUnits,
  baseUnitsToAmount,
  createETHPaymentTransaction,
  createTokenPaymentTransaction,
  createPaymentTransaction,
} from "../evm-utils";
import { TransactionFailedError } from "../x402-types";

describe("CHAINS constant (Mezo only)", () => {
  it("contains exactly the two Mezo networks", () => {
    expect(Object.keys(CHAINS).sort()).toEqual(["mezo", "mezo-testnet"]);
  });

  it("has correct chain IDs", () => {
    expect(CHAINS["mezo"].id).toBe(31612);
    expect(CHAINS["mezo-testnet"].id).toBe(31611);
  });
});

describe("CHAIN_IDS constant", () => {
  it("matches chain objects", () => {
    for (const [network, chainId] of Object.entries(CHAIN_IDS)) {
      expect(CHAINS[network as keyof typeof CHAINS].id).toBe(chainId);
    }
  });
});

describe("TOKEN_ADDRESSES", () => {
  it("has MUSD on both Mezo networks", () => {
    expect(TOKEN_ADDRESSES.mezo.MUSD).toBe("0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186");
    expect(TOKEN_ADDRESSES["mezo-testnet"].MUSD).toBe("0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503");
  });

  it("has MockUSDC on matsnet", () => {
    expect(TOKEN_ADDRESSES["mezo-testnet"].USDC).toBe("0xc2fa1cff46ee4bde61aa5a97e930fb1c3f8d503c");
  });
});

describe("TOKEN_DECIMALS", () => {
  it("has correct decimals (Mezo tokens)", () => {
    expect(TOKEN_DECIMALS.BTC).toBe(18);
    expect(TOKEN_DECIMALS.MUSD).toBe(18);
    expect(TOKEN_DECIMALS.USDC).toBe(6);
    expect(TOKEN_DECIMALS.USDT).toBe(6);
    expect(TOKEN_DECIMALS.DAI).toBe(18);
  });
});

describe("ERC20_ABI", () => {
  it("has transfer, balanceOf, and allowance", () => {
    expect(ERC20_ABI.length).toBe(3);
    expect(ERC20_ABI[0].name).toBe("transfer");
    expect(ERC20_ABI[1].name).toBe("balanceOf");
    expect(ERC20_ABI[2].name).toBe("allowance");
  });
});

describe("getRpcEndpoint", () => {
  it("returns custom endpoint when provided", () => {
    expect(getRpcEndpoint("mezo", "https://my-rpc.com")).toBe("https://my-rpc.com");
  });

  it("returns default public RPCs", () => {
    expect(getRpcEndpoint("mezo")).toBe("https://mezo.drpc.org");
    expect(getRpcEndpoint("mezo-testnet")).toBe("https://rpc.test.mezo.org");
  });
});

describe("getChainId", () => {
  it("returns correct chain IDs", () => {
    expect(getChainId("mezo")).toBe(31612);
    expect(getChainId("mezo-testnet")).toBe(31611);
  });
});

describe("amountToBaseUnits", () => {
  it("converts BTC amounts (18 decimals)", () => {
    expect(amountToBaseUnits("1.0", "BTC")).toBe(1000000000000000000n);
    expect(amountToBaseUnits("0.001", "BTC")).toBe(1000000000000000n);
  });

  it("converts MUSD amounts (18 decimals)", () => {
    expect(amountToBaseUnits("1.0", "MUSD")).toBe(1000000000000000000n);
    expect(amountToBaseUnits("0.0001", "MUSD")).toBe(100000000000000n);
  });

  it("converts USDC amounts (6 decimals)", () => {
    expect(amountToBaseUnits("1.0", "USDC")).toBe(1000000n);
    expect(amountToBaseUnits("100.50", "USDC")).toBe(100500000n);
  });
});

describe("baseUnitsToAmount", () => {
  it("converts MUSD base units to display", () => {
    expect(baseUnitsToAmount(100000000000000n, "MUSD")).toBe("0.0001");
  });

  it("converts USDC base units to display", () => {
    expect(baseUnitsToAmount(1000000n, "USDC")).toBe("1");
  });

  it("is inverse of amountToBaseUnits", () => {
    expect(baseUnitsToAmount(amountToBaseUnits("1.5", "MUSD"), "MUSD")).toBe("1.5");
    expect(baseUnitsToAmount(amountToBaseUnits("99.99", "USDC"), "USDC")).toBe("99.99");
  });
});

describe("createETHPaymentTransaction", () => {
  it("creates a native-value transaction", () => {
    const tx = createETHPaymentTransaction(
      "0x1234567890abcdef1234567890abcdef12345678",
      1000000000000000000n
    );
    expect(tx.to).toBe("0x1234567890abcdef1234567890abcdef12345678");
    expect(tx.value).toBe(1000000000000000000n);
    expect(tx.data).toBeUndefined();
  });
});

describe("createTokenPaymentTransaction", () => {
  it("creates an ERC20 transfer call", () => {
    const tx = createTokenPaymentTransaction(
      "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503",
      "0x1234567890abcdef1234567890abcdef12345678",
      100000000000000n
    );
    expect(tx.to).toBe("0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503");
    expect(tx.value).toBe(0n);
    expect(tx.data.startsWith("0xa9059cbb")).toBe(true); // transfer selector
    expect(tx.data).toContain("1234567890abcdef1234567890abcdef12345678".padStart(64, "0"));
  });
});

describe("createPaymentTransaction", () => {
  it("creates a native BTC transaction for token=BTC", () => {
    const tx = createPaymentTransaction({
      scheme: "exact",
      network: "mezo-testnet",
      chainId: 31611,
      amount: "1000000000000000000",
      token: "BTC",
      recipient: "0x1234567890abcdef1234567890abcdef12345678",
    });
    expect("value" in tx && tx.value).toBe(1000000000000000000n);
  });

  it("creates an ERC-20 MUSD transaction on matsnet", () => {
    const tx = createPaymentTransaction({
      scheme: "exact",
      network: "mezo-testnet",
      chainId: 31611,
      amount: "100000000000000",
      token: "MUSD",
      recipient: "0x1234567890abcdef1234567890abcdef12345678",
    });
    expect(tx.to).toBe("0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503");
    expect("data" in tx).toBe(true);
  });

  it("creates an ERC-20 MockUSDC transaction on matsnet", () => {
    const tx = createPaymentTransaction({
      scheme: "exact",
      network: "mezo-testnet",
      chainId: 31611,
      amount: "1000000",
      token: "USDC",
      recipient: "0x1234567890abcdef1234567890abcdef12345678",
    });
    expect(tx.to?.toLowerCase()).toBe("0xc2fa1cff46ee4bde61aa5a97e930fb1c3f8d503c");
    expect("data" in tx).toBe(true);
  });

  it("throws for unsupported token on a Mezo network (DAI/USDT not deployed on matsnet)", () => {
    expect(() =>
      createPaymentTransaction({
        scheme: "exact",
        network: "mezo-testnet",
        chainId: 31611,
        amount: "1000000",
        token: "DAI",
        recipient: "0x1234567890abcdef1234567890abcdef12345678",
      })
    ).toThrow(TransactionFailedError);
  });
});
