"use client";

import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getCurrencyDisplay } from "@/lib/chain-config";
import { ArrowLeft, Loader2 } from "lucide-react";

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface ResourceFormShellProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

/** Page chrome shared by all create-resource forms: back link, heading, card wrapper. */
export function ResourceFormShell({ title, subtitle, children }: ResourceFormShellProps) {
  return (
    <div className="w-full space-y-6">
      <Link
        href="/dashboard/resources/new"
        className="inline-flex items-center gap-2 text-muted-foreground hover:text-sp-gold transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </Link>

      <h1 className="text-2xl md:text-3xl font-bold text-foreground">{title}</h1>

      <div className="bg-card border border-border rounded-2xl">
        {subtitle && (
          <div className="p-6 border-b border-border">
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>
        )}
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

interface CommonResourceFieldsProps {
  name: string;
  setName: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  priceUsdc?: string;
  setPriceUsdc?: (v: string) => void;
  priceHint?: string;
}

/** Name / description / price fields shared by every resource type. Omit price props to hide the price input. */
export function CommonResourceFields({
  name,
  setName,
  description,
  setDescription,
  priceUsdc,
  setPriceUsdc,
  priceHint,
}: CommonResourceFieldsProps) {
  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="name" className="text-foreground">Name</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My Premium API"
          required
          className="bg-muted border-border text-foreground focus:border-sp-gold"
        />
      </div>

      <div>
        <Label htmlFor="description" className="text-foreground">Description</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What does this resource provide?"
          className="bg-muted border-border text-foreground focus:border-sp-gold"
          rows={3}
        />
      </div>

      {priceUsdc !== undefined && setPriceUsdc && (
        <div>
          <Label htmlFor="price" className="text-foreground">
            Price ({getCurrencyDisplay()})
          </Label>
          <Input
            id="price"
            type="number"
            step="0.001"
            min="0"
            value={priceUsdc}
            onChange={(e) => setPriceUsdc(e.target.value)}
            required
            className="bg-muted border-border text-foreground focus:border-sp-gold"
          />
          <p className="text-xs text-muted-foreground mt-1">
            {priceHint || `Price per access in ${getCurrencyDisplay()}`}
          </p>
        </div>
      )}
    </div>
  );
}

/** Inline error banner shared by the create-resource forms. */
export function FormError({ error }: { error: string }) {
  if (!error) return null;
  return (
    <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
      {error}
    </div>
  );
}

interface SubmitRowProps {
  loading: boolean;
  onCancel: () => void;
  label?: string;
  disabled?: boolean;
}

/** Submit + cancel buttons shared by the create-resource forms. */
export function SubmitRow({ loading, onCancel, label = "Create Resource", disabled = false }: SubmitRowProps) {
  return (
    <div className="flex items-center gap-4 pt-4">
      <button
        type="submit"
        disabled={loading || disabled}
        className="bg-sp-gold hover:bg-sp-gold/90 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl font-bold transition-colors shadow-lg shadow-sp-gold/10 flex items-center gap-2"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Creating...
          </>
        ) : (
          label
        )}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="px-6 py-3 rounded-xl border border-border text-muted-foreground hover:text-foreground hover:border-border transition-colors font-medium"
      >
        Cancel
      </button>
    </div>
  );
}
