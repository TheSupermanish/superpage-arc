"use client";

import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";

import { useEffect } from "react";
import { useTheme } from "next-themes";
import type { Block, BlockNoteEditor, PartialBlock } from "@blocknote/core";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";

interface ArticleEditorProps {
  /** Restore a previous BlockNote document (e.g. from a local draft) */
  initialContent?: PartialBlock[] | null;
  /** Fires with the full BlockNote document JSON on every change */
  onChange?: (blocks: Block[]) => void;
  /** Hands the editor instance to the parent (for blocksToMarkdownLossy etc.) */
  onEditorReady?: (editor: BlockNoteEditor) => void;
}

/**
 * Notion-like writing surface backed by BlockNote.
 * Must be loaded with next/dynamic ssr:false (BlockNote requires window).
 */
export default function ArticleEditor({ initialContent, onChange, onEditorReady }: ArticleEditorProps) {
  const { resolvedTheme } = useTheme();

  const editor = useCreateBlockNote({
    initialContent: initialContent && initialContent.length > 0 ? initialContent : undefined,
  });

  useEffect(() => {
    onEditorReady?.(editor);
  }, [editor, onEditorReady]);

  return (
    <div className="min-h-[50vh] [&_.bn-editor]:bg-transparent">
      <BlockNoteView
        editor={editor}
        theme={resolvedTheme === "light" ? "light" : "dark"}
        onChange={() => onChange?.(editor.document)}
      />
    </div>
  );
}
