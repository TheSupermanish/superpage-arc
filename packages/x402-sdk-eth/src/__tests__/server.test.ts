import { describe, it, expect, vi } from "vitest";
import { X402Server, createX402Server, type X402ServerConfig } from "../server";

describe("X402Server (Mezo)", () => {
  const config: X402ServerConfig = {
    network: "mezo-testnet",
    recipientAddress: "0x1234567890abcdef1234567890abcdef12345678",
    confirmations: 1,
  };

  describe("constructor", () => {
    it("creates a server with config", () => {
      const server = new X402Server(config);
      expect(server).toBeDefined();
      expect(server.getPublicClient()).toBeDefined();
    });

    it("enables cache when configured", () => {
      const server = new X402Server({ ...config, enableCache: true, cacheTTL: 60 });
      expect(server).toBeDefined();
    });
  });

  describe("createPaymentRequirements", () => {
    it("creates MUSD requirements on matsnet", () => {
      const server = new X402Server(config);
      const reqs = server.createPaymentRequirements({ amount: "1.50", token: "MUSD" });

      expect(reqs.scheme).toBe("exact");
      expect(reqs.network).toBe("mezo-testnet");
      expect(reqs.chainId).toBe(31611);
      expect(reqs.amount).toBe("1500000000000000000"); // 1.50 * 1e18 (MUSD = 18 dec)
      expect(reqs.token).toBe("MUSD");
      expect(reqs.recipient).toBe("0x1234567890abcdef1234567890abcdef12345678");
      expect(reqs.requestId).toBeTruthy();
    });

    it("creates BTC (native) requirements on Mezo mainnet", () => {
      const server = new X402Server({ ...config, network: "mezo" });
      const reqs = server.createPaymentRequirements({ amount: "0.001", token: "BTC" });

      expect(reqs.amount).toBe("1000000000000000"); // 0.001 * 1e18
      expect(reqs.token).toBe("BTC");
      expect(reqs.chainId).toBe(31612);
    });

    it("includes optional fields", () => {
      const server = new X402Server(config);
      const reqs = server.createPaymentRequirements({
        amount: "5.00",
        token: "MUSD",
        memo: "Test payment",
        deadline: 1700000000,
        requestId: "custom-req-id",
      });

      expect(reqs.memo).toBe("Test payment");
      expect(reqs.deadline).toBe(1700000000);
      expect(reqs.requestId).toBe("custom-req-id");
    });

    it("generates a unique requestId when not provided", () => {
      const server = new X402Server(config);
      const reqs1 = server.createPaymentRequirements({ amount: "1.00", token: "MUSD" });
      const reqs2 = server.createPaymentRequirements({ amount: "1.00", token: "MUSD" });

      expect(reqs1.requestId).toBeTruthy();
      expect(reqs2.requestId).toBeTruthy();
      expect(reqs1.requestId).not.toBe(reqs2.requestId);
    });
  });

  describe("verifyPayment", () => {
    it("rejects mismatched network", async () => {
      const server = new X402Server(config);
      const requirements = server.createPaymentRequirements({ amount: "1.00", token: "MUSD" });

      const proof = {
        transactionHash: "0xabc",
        network: "mezo" as const, // mainnet doesn't match testnet
        chainId: 31612,
        timestamp: Date.now(),
      };

      const result = await server.verifyPayment(proof, requirements);
      expect(result).toBe(false);
    });

    it("rejects mismatched chainId", async () => {
      const server = new X402Server(config);
      const requirements = server.createPaymentRequirements({ amount: "1.00", token: "MUSD" });

      const proof = {
        transactionHash: "0xabc",
        network: "mezo-testnet" as const,
        chainId: 9999,
        timestamp: Date.now(),
      };

      const result = await server.verifyPayment(proof, requirements);
      expect(result).toBe(false);
    });

    it("rejects expired deadline", async () => {
      const server = new X402Server(config);
      const requirements = server.createPaymentRequirements({
        amount: "1.00",
        token: "MUSD",
        deadline: 1000000000, // way in the past
      });

      const proof = {
        transactionHash: "0xabc",
        network: "mezo-testnet" as const,
        chainId: 31611,
        timestamp: Date.now(),
      };

      const result = await server.verifyPayment(proof, requirements);
      expect(result).toBe(false);
    });
  });

  describe("requirePayment middleware", () => {
    it("returns 402 when no X-Payment header", async () => {
      const server = new X402Server(config);
      const middleware = server.requirePayment({ amount: "1.00", token: "MUSD" });

      const req = { headers: {} } as any;
      const res = {
        statusCode: 0,
        body: null as any,
        status(code: number) { res.statusCode = code; return res; },
        json(data: any) { res.body = data; return res; },
      } as any;
      const next = vi.fn();

      await middleware(req, res, next);

      expect(res.statusCode).toBe(402);
      expect(res.body).toBeDefined();
      expect(res.body.scheme).toBe("exact");
      expect(res.body.amount).toBe("1000000000000000000"); // 1.00 MUSD * 1e18
      expect(next).not.toHaveBeenCalled();
    });

    it("returns 500 for invalid payment proof format", async () => {
      const server = new X402Server(config);
      const middleware = server.requirePayment({ amount: "1.00", token: "MUSD" });

      const req = { headers: { "x-payment": "not-valid-json" } } as any;
      const res = {
        statusCode: 0,
        body: null as any,
        status(code: number) { res.statusCode = code; return res; },
        json(data: any) { res.body = data; return res; },
      } as any;
      const next = vi.fn();

      await middleware(req, res, next);

      expect(res.statusCode).toBe(500);
      expect(next).not.toHaveBeenCalled();
    });
  });
});

describe("createX402Server", () => {
  it("creates an X402Server on mezo-testnet", () => {
    const server = createX402Server({
      network: "mezo-testnet",
      recipientAddress: "0x1234567890abcdef1234567890abcdef12345678",
    });
    expect(server).toBeInstanceOf(X402Server);
  });
});
