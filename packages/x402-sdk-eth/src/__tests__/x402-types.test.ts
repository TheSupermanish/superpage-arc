import { describe, it, expect } from "vitest";
import {
  PaymentSchemeSchema,
  NetworkSchema,
  TokenTypeSchema,
  PaymentRequirementsSchema,
  PaymentProofSchema,
  TransactionStatusSchema,
  SDKConfigSchema,
  X402Error,
  PaymentRequiredError,
  TransactionFailedError,
  InvalidPaymentProofError,
} from "../x402-types";

describe("Zod Schemas (Mezo only)", () => {
  describe("PaymentSchemeSchema", () => {
    it("accepts valid schemes", () => {
      expect(PaymentSchemeSchema.parse("exact")).toBe("exact");
      expect(PaymentSchemeSchema.parse("upto")).toBe("upto");
      expect(PaymentSchemeSchema.parse("spay")).toBe("spay");
    });

    it("rejects invalid schemes", () => {
      expect(() => PaymentSchemeSchema.parse("invalid")).toThrow();
    });
  });

  describe("NetworkSchema", () => {
    it("accepts mezo and mezo-testnet", () => {
      expect(NetworkSchema.parse("mezo")).toBe("mezo");
      expect(NetworkSchema.parse("mezo-testnet")).toBe("mezo-testnet");
    });

    it("rejects removed chains", () => {
      expect(() => NetworkSchema.parse("mainnet")).toThrow();
      expect(() => NetworkSchema.parse("flow")).toThrow();
      expect(() => NetworkSchema.parse("bite-v2-sandbox")).toThrow();
    });
  });

  describe("TokenTypeSchema", () => {
    it("accepts Mezo tokens", () => {
      for (const token of ["BTC", "MUSD", "USDC", "USDT", "DAI"]) {
        expect(TokenTypeSchema.parse(token)).toBe(token);
      }
    });

    it("rejects removed tokens", () => {
      expect(() => TokenTypeSchema.parse("ETH")).toThrow();
      expect(() => TokenTypeSchema.parse("FLOW")).toThrow();
      expect(() => TokenTypeSchema.parse("sFUEL")).toThrow();
    });
  });

  describe("PaymentRequirementsSchema", () => {
    const valid = {
      scheme: "spay",
      network: "mezo-testnet",
      chainId: 31611,
      amount: "100000000000000",
      token: "MUSD",
      recipient: "0x1234567890abcdef1234567890abcdef12345678",
    };

    it("parses valid Mezo payment requirements", () => {
      const result = PaymentRequirementsSchema.parse(valid);
      expect(result.network).toBe("mezo-testnet");
      expect(result.token).toBe("MUSD");
      expect(result.chainId).toBe(31611);
    });

    it("accepts optional fields", () => {
      const withOptionals = { ...valid, memo: "test", deadline: 1700000000, requestId: "req_1" };
      const r = PaymentRequirementsSchema.parse(withOptionals);
      expect(r.memo).toBe("test");
      expect(r.requestId).toBe("req_1");
    });

    it("rejects missing required fields", () => {
      expect(() => PaymentRequirementsSchema.parse({})).toThrow();
    });
  });

  describe("PaymentProofSchema", () => {
    const valid = {
      transactionHash: "0xabc123",
      network: "mezo-testnet",
      chainId: 31611,
      timestamp: 1700000000,
    };

    it("parses valid payment proof", () => {
      const r = PaymentProofSchema.parse(valid);
      expect(r.transactionHash).toBe("0xabc123");
      expect(r.network).toBe("mezo-testnet");
    });

    it("accepts optional requestId", () => {
      const r = PaymentProofSchema.parse({ ...valid, requestId: "req_1" });
      expect(r.requestId).toBe("req_1");
    });
  });

  describe("TransactionStatusSchema", () => {
    it("accepts all statuses", () => {
      for (const status of ["pending", "confirmed", "finalized", "failed"]) {
        expect(TransactionStatusSchema.parse(status)).toBe(status);
      }
    });
  });

  describe("SDKConfigSchema", () => {
    it("parses valid config", () => {
      expect(SDKConfigSchema.parse({ network: "mezo-testnet" }).network).toBe("mezo-testnet");
    });

    it("accepts optional fields", () => {
      const r = SDKConfigSchema.parse({
        network: "mezo",
        rpcEndpoint: "https://custom-rpc.com",
        confirmations: 3,
      });
      expect(r.rpcEndpoint).toBe("https://custom-rpc.com");
      expect(r.confirmations).toBe(3);
    });

    it("rejects confirmations < 1", () => {
      expect(() => SDKConfigSchema.parse({ network: "mezo", confirmations: 0 })).toThrow();
    });
  });
});

describe("Error classes", () => {
  it("X402Error has expected shape", () => {
    const err = new X402Error("test", "TEST_CODE", { extra: true });
    expect(err.code).toBe("TEST_CODE");
    expect(err.details).toEqual({ extra: true });
    expect(err instanceof Error).toBe(true);
  });

  it("PaymentRequiredError carries Mezo payment requirements", () => {
    const reqs = {
      scheme: "spay" as const,
      network: "mezo-testnet" as const,
      chainId: 31611,
      amount: "100000000000000",
      token: "MUSD" as const,
      recipient: "0x123",
    };
    const err = new PaymentRequiredError(reqs);
    expect(err.paymentRequirements).toBe(reqs);
    expect(err.code).toBe("PAYMENT_REQUIRED");
    expect(err instanceof X402Error).toBe(true);
  });

  it("TransactionFailedError has correct code", () => {
    expect(new TransactionFailedError("tx failed").code).toBe("TRANSACTION_FAILED");
  });

  it("InvalidPaymentProofError has correct code", () => {
    expect(new InvalidPaymentProofError("bad proof").code).toBe("INVALID_PAYMENT_PROOF");
  });
});
