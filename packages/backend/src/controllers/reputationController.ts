import { Request, Response } from "express";
import { asyncHandler } from "../middleware/errorHandler.js";
import { Creator } from "../models/index.js";
import {
  getReputationSummary,
  readAllFeedback,
  getClients,
} from "../erc8004/index.js";

/**
 * Public, read-only reputation API backed by the on-chain ERC-8004 Reputation
 * Registry on Arc. Powers the "verified, N happy buyers" badges. All on-chain
 * reads are wrapped so a registry/RPC hiccup degrades to "no reputation yet"
 * rather than breaking the page that embeds the badge.
 */

export interface ReputationView {
  registered: boolean;
  agentId: number | null;
  count: number;
  /** Average feedback value normalized by its on-chain decimals (e.g. 92). */
  score: number | null;
  /** Most common feedback tags, most frequent first. */
  tags: string[];
  registryAddress: string | null;
}

const EMPTY: ReputationView = {
  registered: false,
  agentId: null,
  count: 0,
  score: null,
  tags: [],
  registryAddress: null,
};

const REGISTRY = process.env.ERC8004_REPUTATION_REGISTRY || "0x92b19730d0b7416f195600489cd9be29e109ebce";

/** Read the on-chain reputation for a registered agent id. */
async function loadReputation(agentId: number): Promise<ReputationView> {
  const id = BigInt(agentId);

  // Clients who left feedback (also the anti-Sybil filter set for the summary).
  const clients = await getClients(id);
  if (clients.length === 0) {
    return { registered: true, agentId, count: 0, score: null, tags: [], registryAddress: REGISTRY };
  }

  const summary = await getReputationSummary(id, clients);
  const score =
    summary.count > 0
      ? Number(summary.summaryValue) / 10 ** (summary.summaryValueDecimals || 0)
      : null;

  // Tally tags across feedback for a "known for: x402, quality" line.
  let tags: string[] = [];
  try {
    const entries = await readAllFeedback(id, clients, "", "", false);
    const counts = new Map<string, number>();
    for (const e of entries) {
      for (const t of [e.tag1, e.tag2]) {
        if (t) counts.set(t, (counts.get(t) || 0) + 1);
      }
    }
    tags = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t).slice(0, 5);
  } catch {
    // tags are best-effort
  }

  return {
    registered: true,
    agentId,
    count: summary.count,
    score: score !== null ? Math.round(score * 100) / 100 : null,
    tags,
    registryAddress: REGISTRY,
  };
}

/**
 * GET /api/reputation/agent/:agentId
 * On-chain reputation for an ERC-8004 agent id.
 */
export const getAgentReputation = asyncHandler(async (req: Request, res: Response) => {
  const agentId = parseInt(req.params.agentId, 10);
  if (!Number.isFinite(agentId) || agentId <= 0) {
    return res.status(400).json({ error: "Invalid agentId" });
  }
  try {
    return res.json(await loadReputation(agentId));
  } catch (err: any) {
    console.warn(`[reputation] agent ${agentId} read failed:`, err?.message);
    return res.json({ ...EMPTY, registered: true, agentId });
  }
});

/**
 * GET /api/reputation/by-creator/:username
 * Resolves a creator's ERC-8004 agent id, then returns its on-chain reputation.
 * Returns an unregistered view (not an error) when the creator hasn't claimed an
 * on-chain identity, so badges can simply hide.
 */
export const getCreatorReputation = asyncHandler(async (req: Request, res: Response) => {
  const { username } = req.params;
  const creator = await Creator.findOne({ username }).lean();
  if (!creator) return res.status(404).json({ error: "Creator not found" });

  const agentId = (creator as any).erc8004AgentId;
  if (!agentId) return res.json(EMPTY);

  try {
    return res.json(await loadReputation(Number(agentId)));
  } catch (err: any) {
    console.warn(`[reputation] creator ${username} (agent ${agentId}) read failed:`, err?.message);
    return res.json({ ...EMPTY, registered: true, agentId: Number(agentId) });
  }
});
