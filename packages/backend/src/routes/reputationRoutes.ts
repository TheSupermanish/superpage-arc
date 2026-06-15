import { Router, type Router as ExpressRouter } from "express";
import {
  getAgentReputation,
  getCreatorReputation,
} from "../controllers/reputationController.js";

const router: ExpressRouter = Router();

/**
 * @route   GET /api/reputation/agent/:agentId
 * @desc    On-chain ERC-8004 reputation summary for an agent id.
 * @access  Public
 */
router.get("/agent/:agentId", getAgentReputation);

/**
 * @route   GET /api/reputation/by-creator/:username
 * @desc    On-chain reputation for a creator (via their ERC-8004 agent id).
 * @access  Public
 */
router.get("/by-creator/:username", getCreatorReputation);

export default router;
