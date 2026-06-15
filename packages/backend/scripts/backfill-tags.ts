/**
 * Backfill tags + category on existing resources using the deterministic
 * auto-tagger. Idempotent: re-running only adds derived tags, never drops
 * author tags. Run: pnpm --filter ./packages/backend exec tsx scripts/backfill-tags.ts
 */

import mongoose from "mongoose";
import { Resource } from "../src/models/index.js";
import { autoTag } from "../src/services/auto-tag.js";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/x402";

async function main() {
  await mongoose.connect(MONGODB_URI);
  console.log(`[backfill-tags] connected to ${MONGODB_URI}`);

  const resources = await Resource.find({}).lean();
  console.log(`[backfill-tags] ${resources.length} resources`);

  let updated = 0;
  for (const r of resources as any[]) {
    const { tags, category } = autoTag(
      { name: r.name, description: r.description, type: r.type },
      Array.isArray(r.tags) ? r.tags : []
    );

    const existing = Array.isArray(r.tags) ? r.tags : [];
    const tagsChanged =
      tags.length !== existing.length || tags.some((t, i) => t !== existing[i]);
    const categoryChanged = (r.category || "") !== category;

    if (tagsChanged || categoryChanged) {
      await Resource.updateOne({ _id: r._id }, { $set: { tags, category } });
      updated++;
      console.log(`  • ${String(r.name).slice(0, 40).padEnd(40)} → [${tags.join(", ")}]  (${category})`);
    }
  }

  console.log(`[backfill-tags] updated ${updated}/${resources.length}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("[backfill-tags] failed:", err);
  process.exit(1);
});
