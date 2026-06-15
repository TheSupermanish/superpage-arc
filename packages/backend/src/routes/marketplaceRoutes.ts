import { Router, type Router as ExpressRouter } from "express";
import {
  searchMarketplace,
  listMarketplaceTags,
  relatedMarketplace,
  discoverMarketplace,
} from "../controllers/marketplaceController.js";

const router: ExpressRouter = Router();

/**
 * @route   GET /api/market/search
 * @desc    Search/filter the resource catalog (website + AI agents).
 *          Query: q, type, tag, minPrice, maxPrice, sort, limit, offset.
 * @access  Public
 */
router.get("/search", searchMarketplace);

/**
 * @route   GET /api/market/tags
 * @desc    Top tags across public resources, for the category nav.
 * @access  Public
 */
router.get("/tags", listMarketplaceTags);

/**
 * @route   GET /api/market/discover
 * @desc    Agent-facing discovery: compact catalog + paymentUrl per item.
 *          Query: q, type, tag, maxPrice, sort, limit.
 * @access  Public
 */
router.get("/discover", discoverMarketplace);

/**
 * @route   GET /api/market/related/:id
 * @desc    "More like this" — resources sharing tags/category. Query: limit.
 * @access  Public
 */
router.get("/related/:id", relatedMarketplace);

export default router;
