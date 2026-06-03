import crypto from "crypto";
import { CheckoutRequest } from "../types";

export function deriveNameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname;
    const sub = host.replace(".myshopify.com", "");
    return sub
      .split("-")
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join(" ");
  } catch {
    return "Shopify Store";
  }
}

export function toCentsStr(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

export function hashRequestBody(
  req: Omit<CheckoutRequest, "orderIntentId">
): string {
  const normalized = JSON.stringify({
    storeId: req.storeId,
    items: req.items
      .map((i) => ({
        productId: String(i.productId),
        quantity: Number(i.quantity),
      }))
      .sort((a, b) => a.productId.localeCompare(b.productId)),
    shippingAddress: req.shippingAddress,
    email: req.email,
    clientReferenceId: req.clientReferenceId ?? null,
  });
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

/**
 * Strip HTML tags and decode common entities from a string.
 * Shopify product descriptions arrive as `body_html` (e.g. "<p>A premium…</p>"),
 * but the UI renders them as plain truncated text — so the raw tags leak through.
 * Returns null for empty/nullish input so callers can keep `?? null` semantics.
 */
export function stripHtml(input: unknown): string | null {
  if (input == null) return null;
  const text = String(input)
    .replace(/<[^>]*>/g, " ") // drop tags
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 0 ? text : null;
}

export function normalizePriceString(price: any): string {
  const priceVal = price;
  const priceStr =
    typeof priceVal === "number"
      ? priceVal.toFixed(2)
      : typeof priceVal === "string"
      ? priceVal
      : "0.00";
  return priceStr;
}
