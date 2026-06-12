"use client";

import Link from "next/link";
import {
  Code,
  FileText,
  Video,
  FileDown,
  ShoppingBag,
  ArrowLeft,
} from "lucide-react";

interface ResourceTypeOption {
  href: string;
  title: string;
  description: string;
  icon: typeof Code;
}

const resourceTypes: ResourceTypeOption[] = [
  {
    href: "/dashboard/resources/new/article",
    title: "Article",
    description: "Write and sell a post",
    icon: FileText,
  },
  {
    href: "/dashboard/resources/new/video",
    title: "Video",
    description: "Upload, viewers pay per second",
    icon: Video,
  },
  {
    href: "/dashboard/resources/new/file",
    title: "File",
    description: "Sell a download",
    icon: FileDown,
  },
  {
    href: "/dashboard/resources/new/api",
    title: "API",
    description: "Charge per call",
    icon: Code,
  },
];

export default function NewResourcePage() {
  return (
    <div className="w-full space-y-6">
      {/* Back button */}
      <Link
        href="/dashboard/resources"
        className="inline-flex items-center gap-2 text-muted-foreground hover:text-sp-gold transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Resources
      </Link>

      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">Create New Resource</h1>
        <p className="text-muted-foreground mt-1">What do you want to sell?</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {resourceTypes.map((option) => (
          <Link
            key={option.href}
            href={option.href}
            className="p-8 rounded-2xl border border-sp-gold/30 bg-sp-gold/10 text-left transition-all hover:scale-[1.02] hover:border-sp-gold hover:shadow-lg hover:shadow-sp-gold/10 group"
          >
            <option.icon className="h-10 w-10 mb-4 text-sp-gold group-hover:scale-110 transition-transform" />
            <h3 className="font-bold text-lg text-foreground mb-1">{option.title}</h3>
            <p className="text-sm text-muted-foreground">{option.description}</p>
          </Link>
        ))}
      </div>

      {/* Secondary: Shopify store connection lives under Stores */}
      <Link
        href="/dashboard/stores"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-sp-gold transition-colors"
      >
        <ShoppingBag className="h-4 w-4" />
        Selling Shopify products? Connect your store
        <ArrowLeft className="h-3 w-3 rotate-180" />
      </Link>
    </div>
  );
}
