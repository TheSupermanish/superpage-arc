"use client";

import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";

import { useTheme } from "next-themes";
import type { PartialBlock } from "@blocknote/core";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { marked } from "marked";

interface ArticleRendererProps {
  /** BlockNote document JSON (new-style articles) */
  blocks?: PartialBlock[] | null;
  /** Markdown fallback for legacy articles (config.content) */
  markdown?: string | null;
}

// Hand-rolled typography for the markdown fallback (no typography plugin installed)
const PROSE_CLASSES = [
  "text-foreground leading-relaxed",
  "[&_h1]:font-display [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:mt-10 [&_h1]:mb-4",
  "[&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:mt-10 [&_h2]:mb-4",
  "[&_h3]:text-xl [&_h3]:font-bold [&_h3]:mt-8 [&_h3]:mb-3",
  "[&_p]:my-5 [&_p]:leading-relaxed",
  "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4",
  "[&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-5",
  "[&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-5",
  "[&_li]:my-1.5",
  "[&_blockquote]:border-l-4 [&_blockquote]:border-primary/30 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground [&_blockquote]:my-6",
  "[&_code]:font-mono [&_code]:text-sm [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded",
  "[&_pre]:bg-muted [&_pre]:border [&_pre]:border-border [&_pre]:rounded-xl [&_pre]:p-4 [&_pre]:overflow-x-auto [&_pre]:my-6",
  "[&_pre_code]:bg-transparent [&_pre_code]:px-0 [&_pre_code]:py-0",
  "[&_img]:rounded-xl [&_img]:my-6",
  "[&_hr]:my-8 [&_hr]:border-border",
  "[&_strong]:font-bold [&_strong]:text-foreground",
].join(" ");

function BlocksView({ blocks }: { blocks: PartialBlock[] }) {
  const { resolvedTheme } = useTheme();
  const editor = useCreateBlockNote({ initialContent: blocks });

  return (
    <div className="[&_.bn-editor]:px-0 [&_.bn-editor]:bg-transparent">
      <BlockNoteView
        editor={editor}
        editable={false}
        theme={resolvedTheme === "light" ? "light" : "dark"}
      />
    </div>
  );
}

function MarkdownView({ markdown }: { markdown: string }) {
  const html = marked.parse(markdown, { breaks: true }) as string;
  return <article className={PROSE_CLASSES} dangerouslySetInnerHTML={{ __html: html }} />;
}

/**
 * Read-only article renderer. Prefers stored BlockNote blocks; falls back to
 * markdown for legacy articles. Load with next/dynamic ssr:false.
 * Note: blocks are read once on mount, so key this component when content swaps.
 */
export default function ArticleRenderer({ blocks, markdown }: ArticleRendererProps) {
  if (blocks && blocks.length > 0) {
    return <BlocksView blocks={blocks} />;
  }
  if (markdown) {
    return <MarkdownView markdown={markdown} />;
  }
  return null;
}
