import { Router, type Router as ExpressRouter } from "express";
import { searchMarketplace, listMarketplaceTags } from "../controllers/marketplaceController.js";

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

export default router;
