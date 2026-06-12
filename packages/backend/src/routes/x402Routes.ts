import { Router, type Router as ExpressRouter, Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import { handleResourceAccess } from "../api/x402-gateway.js";
import { handleEthStoreProductAccess, handleEthTest, handleEthCheckout } from "../api/x402-eth-gateway.js";
import { Resource } from "../models/index.js";
import { getCurrency } from "../config/chain-config.js";

const router: ExpressRouter = Router();

// ============================================================
// x402 RESOURCE DISCOVERY (backward compatibility)
// ============================================================

/**
 * @route   GET /x402/resources
 * @desc    List x402 resources (backward compatibility)
 * @access  Public
 */
router.get("/resources", async (req: Request, res: Response, next: NextFunction) => {
  const { listX402Resources } = await import("../controllers/resourcesController.js");
  return listX402Resources(req, res, next);
});

// ============================================================
// x402 RESOURCE PREVIEW (Public - no payment required)
// ============================================================

/** Strip basic markdown syntax for plain-text excerpts and word counts. */
function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_~>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * @route   GET /x402/resource/:resourceId/preview
 * @desc    Free preview metadata. Articles include the free preview blocks
 *          (or a markdown snippet for legacy articles); other types return basic meta.
 * @access  Public
 */
router.get("/resource/:resourceId/preview", async (req: Request, res: Response) => {
  try {
    const { resourceId } = req.params;

    // Lookup by ObjectId first, then by slug (mirrors the gateway)
    let resource: any = null;
    if (mongoose.Types.ObjectId.isValid(resourceId)) {
      resource = await Resource.findById(resourceId)
        .populate("creatorId", "username displayName name")
        .lean();
    }
    if (!resource) {
      resource = await Resource.findOne({ slug: resourceId })
        .populate("creatorId", "username displayName name")
        .lean();
    }

    if (!resource || !resource.isActive) {
      return res.status(404).json({ error: "Resource not found" });
    }

    const config = resource.config || {};
    const base = {
      slug: resource.slug,
      type: resource.type,
      name: resource.name,
      description: resource.description || null,
      priceUsdc: resource.priceUsdc,
      currency: getCurrency(),
      creator: {
        username: resource.creatorId?.username || null,
        displayName: resource.creatorId?.displayName || resource.creatorId?.name || null,
      },
    };

    // Non-article types: basic meta only (product pages reuse this)
    if (resource.type !== "article") {
      return res.json(base);
    }

    const markdown: string = config.markdown ?? config.content ?? "";
    const plain = markdownToPlainText(markdown);
    const excerpt: string = config.excerpt || plain.slice(0, 200);
    const freeBlocks: number = typeof config.freeBlocks === "number" ? config.freeBlocks : 3;
    const hasBlocks = Array.isArray(config.blocks) && config.blocks.length > 0;
    const wordCount = plain ? plain.split(/\s+/).length : 0;

    return res.json({
      ...base,
      excerpt,
      coverImage: config.coverImage || null,
      freeBlocks,
      previewBlocks: hasBlocks ? config.blocks.slice(0, freeBlocks) : null,
      // Legacy markdown-only articles preview the first ~600 chars instead
      previewMarkdown: hasBlocks ? null : markdown.slice(0, 600),
      totalBlocks: hasBlocks ? config.blocks.length : null,
      readingMinutes: Math.max(1, Math.round(wordCount / 200)),
    });
  } catch (err: any) {
    console.error("[x402-routes] Preview error:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
});

// ============================================================
// x402 UNIVERSAL GATEWAY (Public - payment protected)
// ============================================================

/**
 * @route   GET /x402/resource/:resourceId
 * @desc    Access a payment-gated resource (GET)
 * @access  Public (payment protected)
 */
router.get("/resource/:resourceId", handleResourceAccess);

/**
 * @route   POST /x402/resource/:resourceId
 * @desc    Access a payment-gated resource (POST)
 * @access  Public (payment protected)
 */
router.post("/resource/:resourceId", handleResourceAccess);

// ============================================================
// x402 ETHEREUM GATEWAY (EVM payments)
// ============================================================

/**
 * @route   GET /x402/eth/test
 * @desc    Test Ethereum gateway
 * @access  Public
 */
router.get("/eth/test", handleEthTest);

/**
 * @route   GET /x402/eth/store/:storeId/product/:productId
 * @desc    Access store product via Ethereum payment
 * @access  Public (payment protected)
 */
router.get("/eth/store/:storeId/product/:productId", handleEthStoreProductAccess);

/**
 * @route   POST /x402/eth/store/:storeId/checkout
 * @desc    Checkout via Ethereum payment
 * @access  Public
 */
router.post("/eth/store/:storeId/checkout", handleEthCheckout);

export default router;
