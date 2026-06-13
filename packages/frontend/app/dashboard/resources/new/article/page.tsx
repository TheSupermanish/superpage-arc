"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { Block, BlockNoteEditor, PartialBlock } from "@blocknote/core";
import { useAuth } from "@/components/providers/auth-provider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getCurrencyDisplay } from "@/lib/chain-config";
import { API_URL } from "@/components/dashboard/resource-form/shared";
import {
  ArrowLeft,
  Loader2,
  CheckCircle2,
  BookOpen,
  ExternalLink,
  History,
  X,
} from "lucide-react";

const ArticleEditor = dynamic(() => import("@/components/editor/article-editor"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center min-h-[50vh]">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  ),
});

const DRAFT_KEY = "superpage.article-draft.v1";

interface ArticleDraft {
  draftId: string;
  title: string;
  slug: string;
  slugTouched: boolean;
  price: string;
  freeBlocks: string;
  coverImage: string;
  tags: string;
  blocks: PartialBlock[];
  savedAt: number;
}

/** Parse a comma-separated tags input into a deduped, lowercased string[]. */
function parseTags(input: string): string[] {
  const seen = new Set<string>();
  for (const raw of input.split(",")) {
    const tag = raw.trim().toLowerCase();
    if (tag) seen.add(tag);
  }
  return [...seen];
}

/** Mirror of the backend slug generator so the preview matches what gets created. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 50);
}

/** Strip basic markdown syntax to plain text (for the excerpt). */
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

export default function NewArticleResourcePage() {
  const { token } = useAuth();

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [price, setPrice] = useState("0.01");
  const [freeBlocks, setFreeBlocks] = useState("3");
  const [coverImage, setCoverImage] = useState("");
  const [tags, setTags] = useState("");
  const [blocks, setBlocks] = useState<Block[]>([]);

  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const [published, setPublished] = useState<{ slug: string } | null>(null);

  // Draft restore: the editor remounts (via editorKey) when a draft is loaded
  const [pendingDraft, setPendingDraft] = useState<ArticleDraft | null>(null);
  const [restoredBlocks, setRestoredBlocks] = useState<PartialBlock[] | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const draftIdRef = useRef<string>("");

  const editorRef = useRef<BlockNoteEditor | null>(null);
  const handleEditorReady = useCallback((editor: BlockNoteEditor) => {
    editorRef.current = editor;
  }, []);

  // Check for a saved draft on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) {
        draftIdRef.current = `draft-${Date.now()}`;
        return;
      }
      const draft = JSON.parse(raw) as ArticleDraft;
      draftIdRef.current = draft.draftId || `draft-${Date.now()}`;
      if (draft.title || (draft.blocks && draft.blocks.length > 0)) {
        setPendingDraft(draft);
      }
    } catch {
      draftIdRef.current = `draft-${Date.now()}`;
    }
  }, []);

  const restoreDraft = () => {
    if (!pendingDraft) return;
    setTitle(pendingDraft.title || "");
    setSlug(pendingDraft.slug || "");
    setSlugTouched(pendingDraft.slugTouched || false);
    setPrice(pendingDraft.price || "0.01");
    setFreeBlocks(pendingDraft.freeBlocks || "3");
    setCoverImage(pendingDraft.coverImage || "");
    setTags(pendingDraft.tags || "");
    setRestoredBlocks(pendingDraft.blocks || null);
    setEditorKey((k) => k + 1);
    setPendingDraft(null);
  };

  const discardDraft = () => {
    localStorage.removeItem(DRAFT_KEY);
    setPendingDraft(null);
  };

  // Autosave the draft (debounced) so a refresh does not lose work
  useEffect(() => {
    if (published) return;
    if (!title && blocks.length === 0) return;
    const timer = setTimeout(() => {
      const draft: ArticleDraft = {
        draftId: draftIdRef.current,
        title,
        slug,
        slugTouched,
        price,
        freeBlocks,
        coverImage,
        tags,
        blocks: blocks as PartialBlock[],
        savedAt: Date.now(),
      };
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      } catch {
        // localStorage full or unavailable: drafts are best-effort
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [title, slug, slugTouched, price, freeBlocks, coverImage, tags, blocks, published]);

  const handleTitleChange = (value: string) => {
    setTitle(value);
    if (!slugTouched) setSlug(slugify(value));
    if (pendingDraft) setPendingDraft(null);
  };

  const handlePublish = async () => {
    if (!token) {
      setError("Sign in to publish");
      return;
    }
    const editor = editorRef.current;
    if (!editor) return;
    if (!title.trim()) {
      setError("Give your article a title");
      return;
    }

    setPublishing(true);
    setError("");

    try {
      const doc = editor.document;
      const markdown = await editor.blocksToMarkdownLossy(doc);
      const plain = markdownToPlainText(markdown);
      if (!plain) {
        throw new Error("Write some content before publishing");
      }
      const excerpt = plain.slice(0, 200);
      const priceNum = parseFloat(price);
      if (isNaN(priceNum) || priceNum < 0) {
        throw new Error("Price must be a positive number");
      }
      const freeBlocksNum = Math.max(0, parseInt(freeBlocks, 10) || 3);

      const res = await fetch(`${API_URL}/api/resources`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          type: "article",
          name: title.trim(),
          description: excerpt,
          priceUsdc: priceNum,
          slug: slug || slugify(title),
          tags: parseTags(tags),
          config: {
            blocks: doc,
            markdown,
            excerpt,
            coverImage: coverImage.trim() || undefined,
            freeBlocks: freeBlocksNum,
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to publish article");
      }

      const data = await res.json();
      localStorage.removeItem(DRAFT_KEY);
      // Use the server's slug: it may differ if the title collided
      setPublished({ slug: data.resource?.slug || slug || slugify(title) });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setPublishing(false);
    }
  };

  // ── Published: show links to the product and reading pages ──
  if (published) {
    return (
      <div className="w-full max-w-2xl mx-auto py-16">
        <div className="bg-card border border-border rounded-2xl p-8 text-center space-y-6">
          <div className="size-14 rounded-2xl bg-sp-gold/15 text-sp-gold flex items-center justify-center mx-auto">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground font-display">Article published</h1>
            <p className="text-sm text-muted-foreground mt-2">
              Readers get a free preview, then unlock the rest with {getCurrencyDisplay()}.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href={`/read/${published.slug}`}
              className="flex items-center gap-2 bg-sp-gold hover:bg-sp-gold/90 text-white px-5 py-3 rounded-xl font-bold transition-colors"
            >
              <BookOpen className="h-4 w-4" />
              Read it live
            </Link>
            <Link
              href={`/r/${published.slug}`}
              className="flex items-center gap-2 px-5 py-3 rounded-xl border border-border text-foreground hover:border-sp-gold/40 transition-colors font-medium"
            >
              <ExternalLink className="h-4 w-4" />
              Product page
            </Link>
          </div>
          <Link
            href="/dashboard/resources"
            className="inline-block text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Back to resources
          </Link>
        </div>
      </div>
    );
  }

  // ── Writing surface ──
  return (
    <div className="w-full space-y-6">
      {/* Slim top bar: back, settings, publish */}
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/dashboard/resources/new"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-sp-gold transition-colors text-sm"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>

        <div className="flex-1" />

        <div className="flex items-center gap-2">
          <Label htmlFor="price" className="text-xs text-muted-foreground whitespace-nowrap">
            Price ({getCurrencyDisplay()})
          </Label>
          <Input
            id="price"
            type="number"
            step="0.001"
            min="0"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="w-24 h-9 bg-muted border-border text-foreground focus:border-sp-gold"
          />
        </div>

        <div className="flex items-center gap-2">
          <Label htmlFor="freeBlocks" className="text-xs text-muted-foreground whitespace-nowrap">
            Free blocks
          </Label>
          <Input
            id="freeBlocks"
            type="number"
            step="1"
            min="0"
            value={freeBlocks}
            onChange={(e) => setFreeBlocks(e.target.value)}
            className="w-20 h-9 bg-muted border-border text-foreground focus:border-sp-gold"
          />
        </div>

        <button
          type="button"
          onClick={handlePublish}
          disabled={publishing}
          className="bg-sp-gold hover:bg-sp-gold/90 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2 rounded-xl font-bold transition-colors shadow-lg shadow-sp-gold/10 flex items-center gap-2 text-sm"
        >
          {publishing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Publishing...
            </>
          ) : (
            "Publish"
          )}
        </button>
      </div>

      {/* Secondary meta row: cover image + slug */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Input
          value={coverImage}
          onChange={(e) => setCoverImage(e.target.value)}
          placeholder="Cover image URL (optional)"
          className="flex-1 h-9 bg-muted border-border text-foreground focus:border-sp-gold text-sm"
        />
        <Input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="Tags (comma separated)"
          className="flex-1 h-9 bg-muted border-border text-foreground focus:border-sp-gold text-sm"
        />
        <div className="flex items-center gap-1.5 sm:w-72">
          <span className="text-xs text-muted-foreground font-mono whitespace-nowrap">/read/</span>
          <Input
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(slugify(e.target.value));
            }}
            placeholder="article-slug"
            className="h-9 bg-muted border-border text-foreground focus:border-sp-gold text-sm font-mono"
          />
        </div>
      </div>

      {/* Draft restore banner */}
      {pendingDraft && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-sp-blue/10 border border-sp-blue/20 text-sm">
          <History className="h-4 w-4 text-sp-blue shrink-0" />
          <span className="text-foreground flex-1">
            You have an unsaved draft
            {pendingDraft.title ? `: "${pendingDraft.title}"` : ""} from{" "}
            {new Date(pendingDraft.savedAt).toLocaleString()}
          </span>
          <button
            type="button"
            onClick={restoreDraft}
            className="text-sp-blue font-bold hover:underline whitespace-nowrap"
          >
            Restore
          </button>
          <button
            type="button"
            onClick={discardDraft}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Discard draft"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Notion-like writing surface */}
      <div className="max-w-3xl mx-auto w-full">
        {/* Align the title with BlockNote's 54px content gutter */}
        <div className="px-[54px]">
          <input
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="Article title"
            className="w-full bg-transparent border-none outline-none text-4xl font-bold font-display text-foreground placeholder:text-muted-foreground/40 py-4"
          />
        </div>
        <ArticleEditor
          key={editorKey}
          initialContent={restoredBlocks}
          onChange={(b) => {
            setBlocks(b);
            if (pendingDraft) setPendingDraft(null);
          }}
          onEditorReady={handleEditorReady}
        />
      </div>
    </div>
  );
}
