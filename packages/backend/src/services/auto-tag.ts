/**
 * Deterministic auto-tagging + categorization for marketplace resources.
 *
 * Most resources ship with empty tags, which makes discovery (tag nav, related
 * results, agent filtering) thin. This derives a small set of canonical tags
 * and a single category from a resource's name/description/type using a curated
 * keyword vocabulary, with a light keyword-extraction fallback.
 *
 * It is intentionally pure and dependency-free (no LLM/network), so it runs
 * inline on resource create and in a backfill script, and is unit-testable. The
 * shape (autoTag -> { tags, category }) is the seam where an LLM tagger could be
 * swapped in later.
 */

export interface AutoTagInput {
  name: string;
  description?: string | null;
  type?: string | null;
}

export interface AutoTagResult {
  tags: string[];
  category: string;
}

/** A canonical tag, the category it implies, and the patterns that trigger it. */
interface TagRule {
  tag: string;
  category: string;
  patterns: RegExp[];
}

/**
 * Curated vocabulary. Order matters only for category tie-breaking (earlier
 * rules win). Patterns are matched case-insensitively against "name +
 * description". Keep patterns specific enough to avoid false positives (e.g.
 * \bgo\b would over-match, so Go is omitted deliberately).
 */
const TAG_RULES: TagRule[] = [
  // --- AI & agents ---
  { tag: "ai", category: "ai-agents", patterns: [/\bai\b/, /artificial intelligence/, /machine learning/, /\bml\b/] },
  { tag: "agents", category: "ai-agents", patterns: [/\bagent(s|ic)?\b/, /autonomous/] },
  { tag: "llm", category: "ai-agents", patterns: [/\bllm(s)?\b/, /language model/, /\bgpt\b/, /\bclaude\b/] },
  { tag: "mcp", category: "ai-agents", patterns: [/\bmcp\b/, /model context protocol/] },
  { tag: "a2a", category: "ai-agents", patterns: [/\ba2a\b/, /agent[- ]to[- ]agent/, /\bap2\b/] },

  // --- Web3 / crypto ---
  { tag: "web3", category: "web3", patterns: [/web3/, /\bdapp(s)?\b/] },
  { tag: "crypto", category: "web3", patterns: [/crypto(currency|currencies)?\b/, /\bbitcoin\b/, /\bbtc\b/, /ethereum\b/, /\beth\b/] },
  { tag: "smart-contracts", category: "web3", patterns: [/smart contract/, /\bsolidity\b/, /\berc-?\d+/, /on-chain/] },
  { tag: "arc", category: "web3", patterns: [/\barc\b/, /\bcircle\b/] },
  { tag: "mezo", category: "web3", patterns: [/\bmezo\b/, /\bmusd\b/] },

  // --- Finance / payments ---
  { tag: "payments", category: "finance", patterns: [/payment(s)?\b/, /nanopayment/, /micropayment/, /x402/, /\bpay(ing|ment)?\b/] },
  { tag: "stablecoin", category: "finance", patterns: [/stablecoin/, /\busdc\b/, /\busdt\b/, /\beurc\b/, /\bdai\b/] },
  { tag: "defi", category: "finance", patterns: [/\bdefi\b/, /\byield\b/, /liquidity/, /lending/, /staking/] },
  { tag: "trading", category: "finance", patterns: [/trading/, /\btrade(s)?\b/, /market data/, /\bstock(s)?\b/, /portfolio/] },

  // --- Media / streaming ---
  { tag: "streaming", category: "media", patterns: [/stream(ing)?\b/, /per[- ]second/, /\blive\b/] },
  { tag: "video", category: "media", patterns: [/\bvideo(s)?\b/, /\bhls\b/, /\bplayback\b/] },

  // --- Design ---
  { tag: "design", category: "design", patterns: [/\bdesign(ing)?\b/, /\bui\b/, /\bux\b/, /figma/, /typography/] },

  // --- Security ---
  { tag: "security", category: "security", patterns: [/security/, /\baudit(ing|s)?\b/, /vulnerabilit(y|ies)/, /\bauth(entication)?\b/] },

  // --- Data ---
  { tag: "data", category: "data", patterns: [/\bdata(set|base)?(s)?\b/, /analytics/, /\bsql\b/, /\bapi\b/] },

  // --- Engineering / languages ---
  { tag: "typescript", category: "engineering", patterns: [/typescript/, /\bts\b/] },
  { tag: "javascript", category: "engineering", patterns: [/javascript/, /\bjs\b/, /\bnode(\.?js)?\b/] },
  { tag: "react", category: "engineering", patterns: [/\breact\b/, /\bnext(\.?js)?\b/, /frontend/] },
  { tag: "rust", category: "engineering", patterns: [/\brust\b/, /\bcargo\b/] },
  { tag: "python", category: "engineering", patterns: [/python/, /\bdjango\b/, /\bflask\b/] },
  { tag: "git", category: "engineering", patterns: [/\bgit\b/, /version control/, /\bgithub\b/] },
  { tag: "cli", category: "engineering", patterns: [/\bcli\b/, /command[- ]line/, /terminal/] },
  { tag: "system-design", category: "engineering", patterns: [/system design/, /architecture/, /scalab(le|ility)/, /microservice/] },
  { tag: "api", category: "engineering", patterns: [/\bapi(s)?\b/, /\brest\b/, /\bgraphql\b/, /endpoint/] },
  { tag: "tutorial", category: "education", patterns: [/tutorial/, /\bguide\b/, /how[- ]to/, /\bintro(duction)?\b/, /beginner/, /masterclass/, /\bprep\b/] },
];

/** Category fallbacks by resource type when no rule fires. */
const TYPE_CATEGORY: Record<string, string> = {
  article: "reading",
  api: "developer",
  file: "resources",
  video: "media",
  shopify: "store",
};

const MAX_TAGS = 6;

const STOPWORDS = new Set([
  "the", "and", "for", "with", "your", "from", "this", "that", "into", "how",
  "what", "why", "guide", "complete", "ultimate", "best", "using", "build",
  "building", "real", "world", "intro", "introduction", "beginner", "advanced",
  "full", "stack", "tips", "tricks", "learn", "course", "free", "new", "get",
  "getting", "started", "five", "minutes", "minute", "second", "seconds",
]);

function normalizeTag(raw: string): string {
  return raw.toLowerCase().trim().replace(/\s+/g, "-");
}

/** Most-frequent category; ties broken by earliest appearance in the votes. */
function pickCategory(votes: string[]): string | undefined {
  if (votes.length === 0) return undefined;
  const counts = new Map<string, number>();
  for (const v of votes) counts.set(v, (counts.get(v) || 0) + 1);
  let best = votes[0];
  let bestCount = counts.get(best) || 0;
  for (const v of votes) {
    const c = counts.get(v) || 0;
    if (c > bestCount) {
      best = v;
      bestCount = c;
    }
  }
  return best;
}

/**
 * Light fallback: pull 1-2 salient keywords from the name when no curated rule
 * matched, so even off-vocabulary resources get something filterable.
 */
function fallbackTagsFromName(name: string): string[] {
  return Array.from(
    new Set(
      (name.toLowerCase().match(/[a-z][a-z0-9+#.-]{3,}/g) || [])
        .map((w) => w.replace(/[.]+$/, ""))
        .filter((w) => w.length >= 4 && !STOPWORDS.has(w))
    )
  ).slice(0, 2);
}

/**
 * Derive canonical tags + a category from a resource's text. Author-supplied
 * tags (if any) are merged in and take precedence in ordering.
 */
export function autoTag(input: AutoTagInput, existingTags: string[] = []): AutoTagResult {
  const haystack = `${input.name || ""} ${input.description || ""}`.toLowerCase();

  const matched: string[] = [];
  const categoryVotes: string[] = [];
  for (const rule of TAG_RULES) {
    if (rule.patterns.some((p) => p.test(haystack))) {
      matched.push(rule.tag);
      categoryVotes.push(rule.category);
    }
  }

  // Merge author tags first (preserve their intent), then matched, then fallback.
  const authorTags = existingTags.map(normalizeTag).filter(Boolean);
  let tags = Array.from(new Set([...authorTags, ...matched]));
  if (tags.length === 0) tags = fallbackTagsFromName(input.name || "");
  tags = tags.slice(0, MAX_TAGS);

  // Category: tally votes from matched rules plus the resource type's implied
  // category, then pick the most-voted (ties broken by earliest appearance, so
  // rule priority and the strong type signal both matter). E.g. a video whose
  // text mentions "pay per second" still lands in media, not finance.
  const typeCategory = TYPE_CATEGORY[String(input.type || "")];
  const votes = typeCategory ? [...categoryVotes, typeCategory] : [...categoryVotes];
  const category = pickCategory(votes) || typeCategory || "general";

  return { tags, category };
}
