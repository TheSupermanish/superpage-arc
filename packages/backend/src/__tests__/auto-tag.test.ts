import { describe, it, expect } from "vitest";
import { autoTag } from "../services/auto-tag.js";

describe("autoTag", () => {
  it("derives engineering tags + category from a TypeScript article", () => {
    const { tags, category } = autoTag({
      name: "Complete TypeScript Masterclass",
      description: "Learn advanced TypeScript and Node.js patterns.",
      type: "article",
    });
    expect(tags).toContain("typescript");
    expect(tags).toContain("javascript"); // node.js
    expect(category).toBe("engineering");
  });

  it("tags payments/web3 content on Arc", () => {
    const { tags, category } = autoTag({
      name: "Arc in five minutes: USDC as gas",
      description: "How nanopayments settle on Circle's Arc chain.",
      type: "article",
    });
    expect(tags).toEqual(expect.arrayContaining(["arc", "payments", "stablecoin"]));
    // First matched rule (ai-agents come first, but none match here) → finance/web3
    expect(["web3", "finance"]).toContain(category);
  });

  it("tags streaming/video for a stream", () => {
    const { tags, category } = autoTag({
      name: "Live from the Lepton economy (demo stream)",
      description: "A 90 second demo. Watch free then pay per second.",
      type: "video",
    });
    expect(tags).toContain("streaming");
    expect(category).toBe("media");
  });

  it("tags AI/agent content under ai-agents", () => {
    const { tags, category } = autoTag({
      name: "A2A & AP2: How Agents Talk and Pay",
      description: "Agent-to-agent messaging and autonomous payment mandates.",
      type: "article",
    });
    expect(tags).toEqual(expect.arrayContaining(["agents", "a2a"]));
    expect(category).toBe("ai-agents");
  });

  it("merges author tags first and dedupes/normalizes", () => {
    const { tags } = autoTag(
      { name: "React Performance Guide", description: "Optimize render.", type: "article" },
      ["Frontend Perf", "react"]
    );
    expect(tags[0]).toBe("frontend-perf"); // author tag, normalized, first
    expect(tags.filter((t) => t === "react")).toHaveLength(1); // deduped
  });

  it("falls back to salient keywords when nothing matches", () => {
    const { tags, category } = autoTag({
      name: "Watercolor Botanical Illustration Pack",
      description: "Hand-painted florals.",
      type: "file",
    });
    expect(tags.length).toBeGreaterThan(0);
    expect(tags).not.toContain("the");
    expect(category).toBe("resources"); // type fallback
  });

  it("caps tags at 6", () => {
    const { tags } = autoTag({
      name: "AI agents LLM MCP A2A crypto defi payments streaming video design",
      description: "everything",
      type: "article",
    });
    expect(tags.length).toBeLessThanOrEqual(6);
  });
});
