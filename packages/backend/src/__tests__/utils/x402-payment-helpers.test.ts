import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  createPaymentRequirements,
  deepSortObject,
  validateOrderIntentMatch,
  isOrderIntentExpired,
  parsePaymentHeader,
  extractTxHashFromVerification,
} from "../../utils/x402-payment-helpers.js";
import crypto from "crypto";

describe("createPaymentRequirements", () => {
  const amounts = {
    subtotal: "10.00",
    shipping: "2.00",
    tax: "1.00",
    total: "13.00",
    currency: "USD",
  };
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

  it("creates MUSD (stablecoin) requirements by default", () => {
    const reqs = createPaymentRequirements("order-1", amounts, expiresAt);
    expect(reqs).toHaveLength(1);
    const req = reqs[0] as Record<string, any>;
    expect(req.token).toBe("MUSD");
    // 13.00 * 1e18 (MUSD = 18 decimals)
    expect(req.amount).toBe("13000000000000000000");
    expect(req.scheme).toBe("spay");
    expect(req.chainId).toBeTypeOf("number");
    expect(req).toHaveProperty("recipient");
    expect(req.metadata.orderIntentId).toBe("order-1");
    expect(req.metadata.amounts).toEqual(amounts);
  });

  it("creates native BTC requirements when specified", () => {
    const reqs = createPaymentRequirements(
      "order-2",
      amounts,
      expiresAt,
      undefined,
      "BTC"
    );
    expect(reqs).toHaveLength(1);
    expect(reqs[0].token).toBe("BTC");
    // 13.00 * 1e18 = 13000000000000000000 (BTC on Mezo = 18 decimals)
    expect(reqs[0].amount).toBe("13000000000000000000");
    expect(reqs[0].scheme).toBe("spay");
  });

  it("creates MockUSDC (6-decimal) requirements when specified", () => {
    const reqs = createPaymentRequirements(
      "order-3",
      amounts,
      expiresAt,
      undefined,
      "USDC"
    );
    expect(reqs[0].token).toBe("USDC");
    // 13.00 * 1e6 = 13000000
    expect(reqs[0].amount).toBe("13000000");
    expect(reqs[0].scheme).toBe("spay");
  });

  it("includes expiresAt", () => {
    const reqs = createPaymentRequirements("order-4", amounts, expiresAt);
    expect(reqs[0].expiresAt).toBe(expiresAt.toISOString());
  });

  it("uses custom Mezo network when provided", () => {
    const reqs = createPaymentRequirements(
      "order-5",
      amounts,
      expiresAt,
      "mezo"
    );
    expect(reqs[0].network).toBe("mezo");
  });
});

describe("deepSortObject", () => {
  it("should sort object keys alphabetically", () => {
    const input = { c: 3, a: 1, b: 2 };
    const sorted = deepSortObject(input);
    expect(Object.keys(sorted)).toEqual(["a", "b", "c"]);
  });

  it("should sort nested objects", () => {
    const input = { b: { z: 1, a: 2 }, a: 1 };
    const sorted = deepSortObject(input);
    expect(Object.keys(sorted)).toEqual(["a", "b"]);
    expect(Object.keys(sorted.b)).toEqual(["a", "z"]);
  });

  it("should handle arrays", () => {
    const input = [{ b: 1, a: 2 }, { d: 3, c: 4 }];
    const sorted = deepSortObject(input);
    expect(Object.keys(sorted[0])).toEqual(["a", "b"]);
    expect(Object.keys(sorted[1])).toEqual(["c", "d"]);
  });

  it("should handle primitives", () => {
    expect(deepSortObject(42)).toBe(42);
    expect(deepSortObject("hello")).toBe("hello");
    expect(deepSortObject(null)).toBeNull();
  });
});

describe("validateOrderIntentMatch", () => {
  it("should return true for matching requests", () => {
    const requestBody = { product: "item1", quantity: 2 };
    const normalizedBody = deepSortObject(requestBody);
    const bodyHash = crypto
      .createHash("sha256")
      .update(JSON.stringify(normalizedBody))
      .digest("hex");

    const savedIntent = { body_hash: bodyHash };

    expect(
      validateOrderIntentMatch(savedIntent, {
        ...requestBody,
        orderIntentId: "ignored",
      })
    ).toBe(true);
  });

  it("should return false for mismatched requests", () => {
    const savedIntent = { body_hash: "abc123" };
    expect(
      validateOrderIntentMatch(savedIntent, {
        product: "different",
        orderIntentId: "test",
      })
    ).toBe(false);
  });

  it("should ignore orderIntentId in comparison", () => {
    const requestBody = { product: "item1" };
    const normalizedBody = deepSortObject(requestBody);
    const bodyHash = crypto
      .createHash("sha256")
      .update(JSON.stringify(normalizedBody))
      .digest("hex");

    const savedIntent = { body_hash: bodyHash };

    // Same body with different orderIntentId should still match
    expect(
      validateOrderIntentMatch(savedIntent, {
        product: "item1",
        orderIntentId: "any-value",
      })
    ).toBe(true);
  });
});

describe("isOrderIntentExpired", () => {
  it("should return false for null expiresAt", () => {
    expect(isOrderIntentExpired(null)).toBe(false);
  });

  it("should return false for future expiry", () => {
    const future = new Date(Date.now() + 60000).toISOString();
    expect(isOrderIntentExpired(future)).toBe(false);
  });

  it("should return true for past expiry", () => {
    const past = new Date(Date.now() - 60000).toISOString();
    expect(isOrderIntentExpired(past)).toBe(true);
  });
});

describe("parsePaymentHeader", () => {
  it("parses a valid JSON header on matsnet", () => {
    const header = JSON.stringify({
      transactionHash: "0xabc",
      network: "mezo-testnet",
      chainId: 31611,
    });
    const parsed = parsePaymentHeader(header);
    expect(parsed.transactionHash).toBe("0xabc");
    expect(parsed.network).toBe("mezo-testnet");
    expect(parsed.chainId).toBe(31611);
  });

  it("should support txHash alias", () => {
    const header = JSON.stringify({ txHash: "0xdef" });
    const parsed = parsePaymentHeader(header);
    expect(parsed.transactionHash).toBe("0xdef");
  });

  it("should support signature alias", () => {
    const header = JSON.stringify({ signature: "0xghi" });
    const parsed = parsePaymentHeader(header);
    expect(parsed.transactionHash).toBe("0xghi");
  });

  it("should add timestamp if missing", () => {
    const header = JSON.stringify({ transactionHash: "0xabc" });
    const before = Date.now();
    const parsed = parsePaymentHeader(header);
    expect(parsed.timestamp).toBeGreaterThanOrEqual(before);
  });

  it("derives chainId from network (mezo mainnet)", () => {
    const header = JSON.stringify({
      transactionHash: "0xabc",
      network: "mezo",
    });
    const parsed = parsePaymentHeader(header);
    expect(parsed.chainId).toBe(31612);
  });

  it("falls back to DEFAULT_NETWORK chain ID (mezo-testnet = 31611) for unknown network", () => {
    const header = JSON.stringify({
      transactionHash: "0xabc",
      network: "unknown-net",
    });
    const parsed = parsePaymentHeader(header);
    expect(parsed.chainId).toBe(31611);
  });

  it("should throw for invalid JSON", () => {
    expect(() => parsePaymentHeader("not-json")).toThrow(
      "Invalid X-PAYMENT header format"
    );
  });
});

describe("extractTxHashFromVerification", () => {
  it("should extract txHash", () => {
    expect(extractTxHashFromVerification({ txHash: "0x1" })).toBe("0x1");
  });

  it("should extract transaction_hash", () => {
    expect(
      extractTxHashFromVerification({ transaction_hash: "0x2" })
    ).toBe("0x2");
  });

  it("should extract tx_hash", () => {
    expect(extractTxHashFromVerification({ tx_hash: "0x3" })).toBe("0x3");
  });

  it("should return empty string if no hash found", () => {
    expect(extractTxHashFromVerification({})).toBe("");
  });

  it("should prefer txHash over others", () => {
    expect(
      extractTxHashFromVerification({
        txHash: "0x1",
        transaction_hash: "0x2",
      })
    ).toBe("0x1");
  });
});
