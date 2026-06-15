/**
 * MCP tools for validation-gated agent escrow on Arc.
 *
 * The full commission flow, all on-chain:
 *   request_validation -> open_escrow -> respond_validation -> release_escrow
 * Funds release only when the ERC-8004 Validation Registry shows a passing
 * response for the escrow's request + seller agent.
 */
import { z } from "zod";
import { keccak256, toHex } from "viem";
import type { Address } from "viem";
import { toolRegistry, defineTool } from "../tool-registry.js";
import { ERC8004_EXPLORER_URL } from "../../erc8004/config.js";
import { requestValidation, respondToValidation } from "../../erc8004/validation.js";
import { openEscrow, releaseEscrow, refundEscrow, getEscrow } from "../../services/escrow.js";

const tx = (h: string) => `${ERC8004_EXPLORER_URL}/tx/${h}`;

/** Stable bytes32 request hash from a request URI (so callers don't hand-roll hashes). */
function hashFor(requestURI: string): `0x${string}` {
  return keccak256(toHex(requestURI));
}

const requestValidationTool = defineTool({
  name: "request_validation",
  description:
    "Open an ERC-8004 validation request for a seller's agent (caller must own/operate the agent). Returns the requestHash to bind an escrow to.",
  inputSchema: z.object({
    validatorAddress: z.string().describe("Address of the validator that will attest the work"),
    agentId: z.coerce.string().describe("The seller's ERC-8004 agent id"),
    requestURI: z.string().describe("URI describing the commissioned work / deliverable spec"),
  }),
  handler: async ({ validatorAddress, agentId, requestURI }) => {
    try {
      const requestHash = hashFor(requestURI);
      const txHash = await requestValidation(validatorAddress as Address, BigInt(agentId), requestURI, requestHash);
      return { success: true, requestHash, requestURI, txHash, explorerUrl: tx(txHash) };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  },
});

const respondValidationTool = defineTool({
  name: "respond_validation",
  description:
    "Validator records a response (0-100) for a validation request. >= 80 unlocks an escrow gated on this request.",
  inputSchema: z.object({
    requestHash: z.string().describe("The validation request hash (bytes32)"),
    response: z.number().min(0).max(100).describe("Score 0-100; >= 80 passes"),
    responseURI: z.string().optional().describe("URI to the validation result detail"),
    tag: z.string().optional().describe("Tag, e.g. 'delivery'"),
  }),
  handler: async ({ requestHash, response, responseURI, tag }) => {
    try {
      const txHash = await respondToValidation(
        requestHash as `0x${string}`,
        response,
        responseURI ?? "",
        requestHash as `0x${string}`,
        tag ?? "delivery",
      );
      return { success: true, requestHash, response, txHash, explorerUrl: tx(txHash) };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  },
});

const openEscrowTool = defineTool({
  name: "open_escrow",
  description:
    "Lock USDC in escrow for a seller, gated on an ERC-8004 validation (requestHash). Funds release only once that validation passes; otherwise the buyer reclaims after the deadline.",
  inputSchema: z.object({
    seller: z.string().describe("Seller wallet address (paid on release)"),
    agentId: z.coerce.string().describe("Seller's ERC-8004 agent id the work is validated against"),
    requestHash: z.string().describe("Validation request hash from request_validation"),
    amountUsdc: z.number().positive().describe("Amount to hold, in USDC"),
    refundAfterSeconds: z.number().optional().describe("Seconds until buyer can reclaim (default 86400)"),
  }),
  handler: async ({ seller, agentId, requestHash, amountUsdc, refundAfterSeconds }) => {
    try {
      const { id, txHash } = await openEscrow({
        seller: seller as `0x${string}`,
        agentId: BigInt(agentId),
        requestHash: requestHash as `0x${string}`,
        amountUsdc,
        refundAfterSeconds,
      });
      return { success: true, escrowId: id, amountUsdc, txHash, explorerUrl: tx(txHash) };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  },
});

const releaseEscrowTool = defineTool({
  name: "release_escrow",
  description:
    "Release an escrow to the seller. Permissionless on-chain: succeeds only if the bound validation passed (>= 80).",
  inputSchema: z.object({
    escrowId: z.number().describe("The escrow id"),
  }),
  handler: async ({ escrowId }) => {
    try {
      const txHash = await releaseEscrow(escrowId);
      return { success: true, escrowId, txHash, explorerUrl: tx(txHash) };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  },
});

const refundEscrowTool = defineTool({
  name: "refund_escrow",
  description:
    "Refund an escrow to the buyer. Succeeds after the deadline, or early once the bound validation has come back failing.",
  inputSchema: z.object({
    escrowId: z.number().describe("The escrow id"),
  }),
  handler: async ({ escrowId }) => {
    try {
      const txHash = await refundEscrow(escrowId);
      return { success: true, escrowId, txHash, explorerUrl: tx(txHash) };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  },
});

const getEscrowTool = defineTool({
  name: "get_escrow",
  description: "Read an escrow's on-chain state (parties, amount, validation binding, status).",
  inputSchema: z.object({
    escrowId: z.number().describe("The escrow id"),
  }),
  handler: async ({ escrowId }) => {
    try {
      return { success: true, escrow: await getEscrow(escrowId) };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  },
});

export function registerEscrowTools(): void {
  toolRegistry.register(requestValidationTool, "escrow");
  toolRegistry.register(respondValidationTool, "escrow");
  toolRegistry.register(openEscrowTool, "escrow");
  toolRegistry.register(releaseEscrowTool, "escrow");
  toolRegistry.register(refundEscrowTool, "escrow");
  toolRegistry.register(getEscrowTool, "escrow");
  console.log("[Escrow Tools] ✅ Registered 6 tools");
}
