"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/providers/auth-provider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, CheckCircle, Loader2, Play, ExternalLink } from "lucide-react";
import {
  API_URL,
  ResourceFormShell,
  CommonResourceFields,
  FormError,
  SubmitRow,
} from "@/components/dashboard/resource-form/shared";

type UploadPhase = "form" | "uploading" | "transcoding" | "ready" | "error";

const ACCEPTED = ".mp4,.mov,.webm";

/** Parse a comma-separated tags input into a deduped, lowercased string[]. */
function parseTags(input: string): string[] {
  const seen = new Set<string>();
  for (const raw of input.split(",")) {
    const tag = raw.trim().toLowerCase();
    if (tag) seen.add(tag);
  }
  return [...seen];
}

export default function NewVideoResourcePage() {
  const router = useRouter();
  const { token } = useAuth();

  const [phase, setPhase] = useState<UploadPhase>("form");
  const [error, setError] = useState("");
  const [uploadPercent, setUploadPercent] = useState(0);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [pricePerMinute, setPricePerMinute] = useState("0.30");
  const [freePreviewSeconds, setFreePreviewSeconds] = useState("10");
  const [coverImage, setCoverImage] = useState("");
  const [tags, setTags] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const [createdResource, setCreatedResource] = useState<{ id: string; slug: string } | null>(null);

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  const pricePerSecond = (parseFloat(pricePerMinute) || 0) / 60;

  const pollTranscode = (resourceId: string) => {
    pollTimerRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_URL}/stream/transcode-status/${resourceId}`);
        if (!res.ok) return;
        const body = await res.json();
        if (body.status === "ready") {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          setPhase("ready");
        } else if (body.status === "error") {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          setError(body.error || "Transcoding failed");
          setPhase("error");
        }
      } catch {
        // Transient poll error, keep trying
      }
    }, 2_000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !file) return;

    if (pricePerSecond <= 0) {
      setError("Price per minute must be greater than zero");
      return;
    }

    setError("");
    setPhase("uploading");
    setUploadPercent(0);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("name", name);
    formData.append("description", description);
    formData.append("pricePerSecondUsdc", String(pricePerSecond));
    formData.append("freePreviewSeconds", freePreviewSeconds);
    if (coverImage) formData.append("coverImage", coverImage);
    // Comma-separated string; the upload endpoint parses it into a tag array
    const parsedTags = parseTags(tags);
    if (parsedTags.length) formData.append("tags", parsedTags.join(","));

    // XMLHttpRequest for upload progress (fetch has no upload events)
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_URL}/stream/upload`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable) {
        setUploadPercent(Math.round((evt.loaded / evt.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const body = JSON.parse(xhr.responseText);
          setCreatedResource({ id: body.resource.id, slug: body.resource.slug });
          setPhase("transcoding");
          pollTranscode(body.resource.id);
        } catch {
          setError("Unexpected server response");
          setPhase("error");
        }
      } else {
        try {
          setError(JSON.parse(xhr.responseText)?.error || `Upload failed (${xhr.status})`);
        } catch {
          setError(`Upload failed (${xhr.status})`);
        }
        setPhase("error");
      }
    };
    xhr.onerror = () => {
      setError("Upload failed: network error");
      setPhase("error");
    };

    xhr.send(formData);
  };

  const acceptFile = (f: File | null) => {
    if (!f) return;
    const ext = f.name.toLowerCase().split(".").pop();
    if (!["mp4", "mov", "webm"].includes(ext || "")) {
      setError("Only mp4, mov, or webm videos are accepted");
      return;
    }
    setError("");
    setFile(f);
  };

  // ── Success state ──
  if (phase === "ready" && createdResource) {
    return (
      <ResourceFormShell title="Sell a Video" subtitle="Your video is live">
        <div className="space-y-6 text-center py-6">
          <div className="mx-auto size-14 rounded-2xl bg-sp-gold/10 flex items-center justify-center">
            <CheckCircle className="h-7 w-7 text-sp-gold" />
          </div>
          <div>
            <p className="text-lg font-bold text-foreground">{name} is ready to stream</p>
            <p className="text-sm text-muted-foreground mt-1">
              Viewers get a free preview, then pay ${pricePerSecond.toFixed(6)} per second watched.
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Link
              href={`/watch/${createdResource.slug}`}
              className="inline-flex items-center gap-2 bg-sp-gold hover:bg-sp-gold/90 text-white px-6 py-3 rounded-xl font-bold transition-colors"
            >
              <Play className="h-4 w-4" />
              Watch page
            </Link>
            <Link
              href={`/r/${createdResource.slug}`}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-border text-muted-foreground hover:text-foreground transition-colors font-medium"
            >
              <ExternalLink className="h-4 w-4" />
              Product page
            </Link>
          </div>
        </div>
      </ResourceFormShell>
    );
  }

  // ── Upload / transcode progress ──
  if (phase === "uploading" || phase === "transcoding") {
    return (
      <ResourceFormShell title="Sell a Video" subtitle="Hang tight, preparing your stream">
        <div className="space-y-6 py-6">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 text-sp-gold animate-spin" />
            <p className="text-sm font-medium text-foreground">
              {phase === "uploading"
                ? `Uploading ${file?.name}... ${uploadPercent}%`
                : "Transcoding to HLS (this can take a while for long videos)..."}
            </p>
          </div>
          <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full bg-sp-gold transition-all ${phase === "transcoding" ? "animate-pulse w-full" : ""}`}
              style={phase === "uploading" ? { width: `${uploadPercent}%` } : undefined}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Keep this tab open. You will get links to the watch and product pages when it finishes.
          </p>
        </div>
      </ResourceFormShell>
    );
  }

  // ── Form ──
  return (
    <ResourceFormShell
      title="Sell a Video"
      subtitle="Upload a video, viewers pay per second watched via a streaming payment channel"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <CommonResourceFields
          name={name}
          setName={setName}
          description={description}
          setDescription={setDescription}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="pricePerMinute" className="text-foreground">Price per minute (USDC)</Label>
            <Input
              id="pricePerMinute"
              type="number"
              step="0.01"
              min="0.000001"
              value={pricePerMinute}
              onChange={(e) => setPricePerMinute(e.target.value)}
              required
              className="bg-muted border-border text-foreground focus:border-sp-gold"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Billed per second: ${pricePerSecond > 0 ? pricePerSecond.toFixed(6) : "0"}/sec
            </p>
          </div>
          <div>
            <Label htmlFor="freePreview" className="text-foreground">Free preview (seconds)</Label>
            <Input
              id="freePreview"
              type="number"
              step="1"
              min="0"
              value={freePreviewSeconds}
              onChange={(e) => setFreePreviewSeconds(e.target.value)}
              className="bg-muted border-border text-foreground focus:border-sp-gold"
            />
            <p className="text-xs text-muted-foreground mt-1">Watchable before payment</p>
          </div>
        </div>

        <div>
          <Label htmlFor="coverImage" className="text-foreground">Cover image URL (optional)</Label>
          <Input
            id="coverImage"
            type="url"
            value={coverImage}
            onChange={(e) => setCoverImage(e.target.value)}
            placeholder="https://example.com/cover.jpg"
            className="bg-muted border-border text-foreground focus:border-sp-gold"
          />
        </div>

        <div>
          <Label htmlFor="tags" className="text-foreground">Tags (optional)</Label>
          <Input
            id="tags"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="tutorial, solidity, defi"
            className="bg-muted border-border text-foreground focus:border-sp-gold"
          />
          <p className="text-xs text-muted-foreground mt-1">Comma separated, used for search and discovery</p>
        </div>

        <div className="space-y-4 pt-4 border-t border-border">
          <h4 className="font-medium text-sm text-muted-foreground">Video File</h4>
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              acceptFile(e.dataTransfer.files?.[0] || null);
            }}
            className={`flex flex-col items-center justify-center w-full h-36 border-2 border-dashed rounded-xl cursor-pointer transition-all ${
              dragOver
                ? "border-sp-gold bg-sp-gold/5"
                : "border-border bg-muted hover:bg-muted/80 hover:border-sp-gold/30"
            }`}
          >
            <div className="flex flex-col items-center justify-center pt-5 pb-6">
              {file ? (
                <>
                  <CheckCircle className="h-8 w-8 text-sp-gold mb-2" />
                  <p className="text-sm text-foreground">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </>
              ) : (
                <>
                  <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Drag and drop or click to upload
                  </p>
                  <p className="text-xs text-muted-foreground">mp4, mov, or webm, up to 2GB</p>
                </>
              )}
            </div>
            <input
              type="file"
              accept={ACCEPTED}
              className="hidden"
              onChange={(e) => acceptFile(e.target.files?.[0] || null)}
            />
          </label>
        </div>

        <FormError error={error} />

        <SubmitRow
          loading={false}
          disabled={!file || !name}
          label="Upload and Publish"
          onCancel={() => router.push("/dashboard/resources")}
        />
      </form>
    </ResourceFormShell>
  );
}
