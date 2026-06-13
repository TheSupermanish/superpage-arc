"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth-provider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  API_URL,
  ResourceFormShell,
  CommonResourceFields,
  FormError,
  SubmitRow,
} from "@/components/dashboard/resource-form/shared";

/** Parse a comma-separated tags input into a deduped, lowercased string[]. */
function parseTags(input: string): string[] {
  const seen = new Set<string>();
  for (const raw of input.split(",")) {
    const tag = raw.trim().toLowerCase();
    if (tag) seen.add(tag);
  }
  return [...seen];
}

export default function NewApiResourcePage() {
  const router = useRouter();
  const { token } = useAuth();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priceUsdc, setPriceUsdc] = useState("0.01");
  const [tags, setTags] = useState("");
  const [upstreamUrl, setUpstreamUrl] = useState("");
  const [method, setMethod] = useState("GET");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_URL}/api/resources`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          type: "api",
          name,
          description,
          priceUsdc: parseFloat(priceUsdc),
          tags: parseTags(tags),
          config: { upstream_url: upstreamUrl, method },
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
      title="Sell an API"
      subtitle="Monetize any API endpoint with pay-per-call"
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

        <div>
          <Label htmlFor="tags" className="text-foreground">Tags (optional)</Label>
          <Input
            id="tags"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="weather, geocoding, data"
            className="bg-muted border-border text-foreground focus:border-sp-gold"
          />
          <p className="text-xs text-muted-foreground mt-1">Comma separated, used for search and discovery</p>
        </div>

        <div className="space-y-4 pt-4 border-t border-border">
          <h4 className="font-medium text-sm text-muted-foreground">API Configuration</h4>
          <div>
            <Label htmlFor="upstream" className="text-foreground">Upstream URL</Label>
            <Input
              id="upstream"
              type="url"
              value={upstreamUrl}
              onChange={(e) => setUpstreamUrl(e.target.value)}
              placeholder="https://api.example.com/endpoint"
              required
              className="bg-muted border-border text-foreground focus:border-sp-gold"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Requests will be proxied to this URL after payment
            </p>
          </div>
          <div>
            <Label htmlFor="method" className="text-foreground">HTTP Method</Label>
            <select
              id="method"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-muted border border-border text-foreground focus:border-sp-gold focus:outline-none"
            >
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="DELETE">DELETE</option>
            </select>
          </div>
        </div>

        <FormError error={error} />

        <SubmitRow loading={loading} onCancel={() => router.push("/dashboard/resources")} />
      </form>
    </ResourceFormShell>
  );
}
