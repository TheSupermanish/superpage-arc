"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, CheckCircle, Link as LinkIcon } from "lucide-react";
import {
  API_URL,
  ResourceFormShell,
  CommonResourceFields,
  FormError,
  SubmitRow,
} from "@/components/dashboard/resource-form/shared";

export default function NewFileResourcePage() {
  const router = useRouter();
  const { token } = useAuth();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priceUsdc, setPriceUsdc] = useState("0.01");

  const [fileMode, setFileMode] = useState<"upload" | "link">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState("");
  const [fileName, setFileName] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    setLoading(true);
    setError("");

    try {
      // Upload mode goes through the multipart upload endpoint
      if (fileMode === "upload" && file) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("name", name);
        formData.append("description", description);
        formData.append("priceUsdc", priceUsdc);

        const res = await fetch(`${API_URL}/api/upload`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to upload file");
        }

        router.push("/dashboard/resources");
        return;
      }

      // External file link
      const res = await fetch(`${API_URL}/api/resources`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          type: "file",
          name,
          description,
          priceUsdc: parseFloat(priceUsdc),
          config: {
            external_url: fileUrl,
            filename: fileName || fileUrl.split("/").pop() || "download",
            mode: "external",
          },
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create resource");
      }

      router.push("/dashboard/resources");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ResourceFormShell
      title="Sell a File"
      subtitle="Upload a file or link to an external URL"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <CommonResourceFields
          name={name}
          setName={setName}
          description={description}
          setDescription={setDescription}
          priceUsdc={priceUsdc}
          setPriceUsdc={setPriceUsdc}
        />

        <div className="space-y-4 pt-4 border-t border-border">
          <h4 className="font-medium text-sm text-muted-foreground">File Source</h4>

          {/* Mode selector */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setFileMode("upload")}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl border transition-all font-medium ${
                fileMode === "upload"
                  ? "border-sp-gold bg-sp-gold/10 text-sp-gold"
                  : "border-border text-muted-foreground hover:border-sp-gold/30 hover:text-sp-gold"
              }`}
            >
              <Upload className="h-4 w-4" />
              Upload File
            </button>
            <button
              type="button"
              onClick={() => setFileMode("link")}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl border transition-all font-medium ${
                fileMode === "link"
                  ? "border-sp-gold bg-sp-gold/10 text-sp-gold"
                  : "border-border text-muted-foreground hover:border-sp-gold/30 hover:text-sp-gold"
              }`}
            >
              <LinkIcon className="h-4 w-4" />
              External Link
            </button>
          </div>

          {fileMode === "upload" ? (
            <div>
              <Label className="text-foreground">File</Label>
              <div className="mt-2">
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-border border-dashed rounded-xl cursor-pointer bg-muted hover:bg-muted/80 hover:border-sp-gold/30 transition-all">
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
                          Click to upload or drag and drop
                        </p>
                        <p className="text-xs text-muted-foreground">Max 50MB</p>
                      </>
                    )}
                  </div>
                  <input
                    type="file"
                    className="hidden"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                  />
                </label>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <Label htmlFor="fileUrl" className="text-foreground">File URL</Label>
                <Input
                  id="fileUrl"
                  type="url"
                  value={fileUrl}
                  onChange={(e) => setFileUrl(e.target.value)}
                  placeholder="https://example.com/files/document.pdf"
                  required
                  className="bg-muted border-border text-foreground focus:border-sp-gold"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  S3, Dropbox, Google Drive, or any direct download URL
                </p>
              </div>
              <div>
                <Label htmlFor="fileName" className="text-foreground">File Name (optional)</Label>
                <Input
                  id="fileName"
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                  placeholder="my-document.pdf"
                  className="bg-muted border-border text-foreground focus:border-sp-gold"
                />
              </div>
            </div>
          )}
        </div>

        <FormError error={error} />

        <SubmitRow loading={loading} onCancel={() => router.push("/dashboard/resources")} />
      </form>
    </ResourceFormShell>
  );
}
