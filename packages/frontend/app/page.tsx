"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { PublicNavbar } from "@/components/public-navbar";
import { ProductCard, type ProductCardItem } from "@/components/product-card";
import {
  ArrowRight,
  Wallet,
  UploadCloud,
  CircleDollarSign,
  Bot,
  Zap,
  ShieldCheck,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface ExploreResource {
  id: string;
  slug: string;
  type: "api" | "file" | "article" | "video" | "shopify";
  name: string;
  description: string | null;
  priceUsdc: number;
  coverImage?: string | null;
  pricePerSecondUsdc?: number | null;
  createdAt: string;
  creator: { name: string; username?: string };
}

/**
 * Reveal-on-scroll: adds .in-view to elements with .reveal when they enter
 * the viewport. Under prefers-reduced-motion the CSS keeps them fully visible,
 * so this is purely additive and safe.
 */
function useScrollReveal() {
  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>(".reveal"));
    if (nodes.length === 0) return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in-view");
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );

    nodes.forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, []);
}

export default function LandingPage() {
  const [featured, setFeatured] = useState<ExploreResource[]>([]);
  const [loadingFeatured, setLoadingFeatured] = useState(true);
  useScrollReveal();

  useEffect(() => {
    const fetchFeatured = async () => {
      try {
        // The API sorts by popularity; fetch a wide pool so newly published
        // items are in it before we re-sort by date below.
        const res = await fetch(`${API_URL}/api/explore?limit=100`);
        if (!res.ok) return;
        const json = await res.json();
        const resources: ExploreResource[] = json.data?.resources || [];
        const newest = [...resources].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        setFeatured(newest.slice(0, 8));
      } catch {
        // Featured grid is decorative; fail silently
      } finally {
        setLoadingFeatured(false);
      }
    };
    fetchFeatured();
  }, []);

  const toCardItem = (r: ExploreResource): ProductCardItem => ({
    id: r.id,
    slug: r.slug,
    type: r.type,
    name: r.name,
    description: r.description,
    priceUsdc: r.priceUsdc,
    coverImage: r.coverImage,
    pricePerSecondUsdc: r.pricePerSecondUsdc,
    creator: { username: r.creator?.username, name: r.creator?.name },
  });

  return (
    <div className="min-h-screen bg-background text-foreground antialiased overflow-x-hidden">
      <PublicNavbar />

      {/* ============================================
          HERO — the lepton thesis: value divides down
          to the smallest coin, the floor is removed.
          ============================================ */}
      <section className="relative px-6 pt-36 pb-24 md:pt-44 md:pb-28 overflow-hidden">
        {/* Fine divisible grid, masked to a soft halo */}
        <div className="absolute inset-0 grid-fade pointer-events-none" aria-hidden />
        {/* Ambient brand glows, slow drift */}
        <div className="absolute top-20 left-[6%] w-72 h-72 rounded-full bg-sp-pink/10 blur-3xl pointer-events-none glow-drift" aria-hidden />
        <div className="absolute top-52 right-[8%] w-64 h-64 rounded-full bg-sp-blue/12 blur-3xl pointer-events-none glow-drift" style={{ animationDelay: "-6s" }} aria-hidden />

        <div className="relative max-w-4xl mx-auto text-center">
          <div className="reveal inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold tracking-wide">
            <Zap className="h-3.5 w-3.5" />
            USDC payments over HTTP 402, settled on Arc
          </div>

          <h1 className="reveal reveal-delay-1 mt-8 font-display text-5xl sm:text-6xl md:text-7xl font-bold leading-[1.02] tracking-tight text-balance">
            Price anything down to{" "}
            <span className="gradient-text">the smallest coin.</span>
          </h1>

          <p className="reveal reveal-delay-2 mt-7 text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            SuperPage takes the floor off pricing. Charge by the article, by the
            download, by the second of video, all the way down to a fraction of a
            cent. Buyers pay in USDC on Arc: instant, final, fees under a cent.
          </p>

          {/* The lepton meter: a price divides toward the smallest unit */}
          <div className="reveal reveal-delay-3 mt-9 flex justify-center">
            <LeptonMeter />
          </div>

          <div className="reveal reveal-delay-3 mt-9 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/dashboard"
              className="shimmer-btn px-8 py-4 text-white rounded-full font-bold text-lg flex items-center gap-2"
            >
              Start selling <ArrowRight className="h-5 w-5" />
            </Link>
            <Link
              href="/explore"
              className="px-8 py-4 bg-card text-foreground border border-border rounded-full font-bold text-lg hover:border-primary/30 transition-colors glow-border"
            >
              Explore the market
            </Link>
          </div>

          <div className="reveal reveal-delay-4 mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5 font-medium">
              <ShieldCheck className="h-4 w-4 text-sp-blue" /> Settled in USDC
            </div>
            <span className="hidden sm:inline text-border" aria-hidden>·</span>
            <div className="flex items-center gap-1.5 font-medium">
              <Zap className="h-4 w-4 text-sp-gold" /> Sub-cent fees
            </div>
            <span className="hidden sm:inline text-border" aria-hidden>·</span>
            <div className="flex items-center gap-1.5 font-medium">
              <Bot className="h-4 w-4 text-sp-pink" /> Agents buy autonomously
            </div>
          </div>
        </div>
      </section>

      {/* ============================================
          LIVE FEATURED GRID
          ============================================ */}
      {(loadingFeatured || featured.length > 0) && (
        <section className="pb-16 px-6">
          <div className="max-w-7xl mx-auto space-y-8">
            <div className="reveal flex items-end justify-between gap-4">
              <div>
                <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight">
                  Fresh on the market
                </h2>
                <p className="text-muted-foreground mt-2">Real products, live right now.</p>
              </div>
              <Link
                href="/explore"
                className="text-sm font-bold text-primary hover:underline whitespace-nowrap"
              >
                See everything
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {loadingFeatured
                ? Array.from({ length: 4 }).map((_, i) => <FeaturedSkeleton key={i} />)
                : featured.map((r) => <ProductCard key={r.id} item={toCardItem(r)} />)}
            </div>
          </div>
        </section>
      )}

      {/* ============================================
          HOW IT WORKS
          ============================================ */}
      <section className="py-24 px-6" id="how-it-works">
        <div className="max-w-5xl mx-auto">
          <div className="reveal text-center mb-14 space-y-3">
            <p className="text-primary font-bold tracking-widest uppercase text-sm">How it works</p>
            <h2 className="font-display text-4xl md:text-5xl font-bold">
              Three steps to your first sale
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="reveal group p-8 rounded-3xl bg-card border border-border hover:border-primary/30 lift relative">
              <div className="text-6xl font-bold text-border group-hover:text-primary/10 transition-colors absolute top-6 right-8">01</div>
              <div className="size-14 rounded-2xl bg-sp-blue/15 text-sp-blue flex items-center justify-center mb-6">
                <Wallet className="h-7 w-7" />
              </div>
              <h3 className="text-2xl font-bold mb-3">Connect wallet</h3>
              <p className="text-muted-foreground leading-relaxed">
                Your wallet is your account. No forms, no payout setup, no waiting for approval.
              </p>
            </div>

            <div className="reveal reveal-delay-1 group p-8 rounded-3xl bg-card border border-border hover:border-primary/30 lift relative">
              <div className="text-6xl font-bold text-border group-hover:text-primary/10 transition-colors absolute top-6 right-8">02</div>
              <div className="size-14 rounded-2xl bg-sp-pink/15 text-sp-pink flex items-center justify-center mb-6">
                <UploadCloud className="h-7 w-7" />
              </div>
              <h3 className="text-2xl font-bold mb-3">Publish</h3>
              <p className="text-muted-foreground leading-relaxed">
                Upload a video, write an article, attach a file, or paywall an API. Set your price.
              </p>
            </div>

            <div className="reveal reveal-delay-2 group p-8 rounded-3xl bg-card border border-border hover:border-primary/30 lift relative">
              <div className="text-6xl font-bold text-border group-hover:text-primary/10 transition-colors absolute top-6 right-8">03</div>
              <div className="size-14 rounded-2xl bg-sp-gold/15 text-sp-gold flex items-center justify-center mb-6">
                <CircleDollarSign className="h-7 w-7" />
              </div>
              <h3 className="text-2xl font-bold mb-3">Earn per use</h3>
              <p className="text-muted-foreground leading-relaxed">
                Per article, per download, per API call, per second watched. USDC lands in your wallet instantly.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================
          BUILT FOR AI AGENTS
          ============================================ */}
      <section className="py-24 px-6 bg-secondary relative overflow-hidden" id="ai">
        <div className="absolute top-0 inset-x-0 hairline" aria-hidden />
        <div className="absolute bottom-0 inset-x-0 hairline" aria-hidden />

        <div className="max-w-5xl mx-auto text-center space-y-10">
          <div className="reveal space-y-4">
            <p className="text-primary font-bold tracking-widest uppercase text-sm">Agents are customers too</p>
            <h2 className="font-display text-4xl md:text-5xl font-bold">
              Every product is one HTTP request away
            </h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              SuperPage speaks x402: a 402 response carries the price, the agent signs a USDC
              payment, retries, and gets the content. No accounts, no API keys, no humans in the loop.
            </p>
          </div>

          <div className="reveal reveal-delay-1 flex flex-wrap items-center justify-center gap-4">
            {[
              { label: "x402", desc: "HTTP 402" },
              { label: "MCP", desc: "Model Context" },
              { label: "A2A", desc: "Agent-to-Agent" },
              { label: "ERC-8004", desc: "Trustless Agents" },
            ].map((badge) => (
              <div
                key={badge.label}
                className="px-6 py-3 rounded-2xl bg-card border border-border text-center glow-border"
              >
                <p className="font-bold text-lg">{badge.label}</p>
                <p className="text-xs text-muted-foreground">{badge.desc}</p>
              </div>
            ))}
          </div>

          <div className="reveal reveal-delay-2 max-w-2xl mx-auto bg-card rounded-3xl border border-border p-6 md:p-8 text-left overflow-x-auto">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-3 h-3 rounded-full bg-sp-coral/60" />
              <div className="w-3 h-3 rounded-full bg-sp-gold/60" />
              <div className="w-3 h-3 rounded-full bg-sp-blue/60" />
              <span className="text-xs text-muted-foreground ml-2 font-mono">payment-flow.ts</span>
            </div>
            <pre className="!bg-transparent !border-0 !p-0 text-sm leading-relaxed">
              <code className="!text-foreground">{`// AI agent pays for a resource via x402
const response = await fetch(resourceUrl);

if (response.status === 402) {
  // Get payment details from the header
  const paymentInfo = response.headers
    .get("X-PAYMENT");

  // Sign a USDC payment on Arc
  const payment = await signPayment(paymentInfo);

  // Retry with the payment attached
  const result = await fetch(resourceUrl, {
    headers: { "X-PAYMENT": payment }
  });

  // 200 OK: resource unlocked
}`}</code>
            </pre>
          </div>
        </div>
      </section>

      {/* ============================================
          FINAL CTA
          ============================================ */}
      <section className="py-28 px-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-sp-blue/5 via-sp-pink/5 to-sp-gold/5" aria-hidden />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary/5 blur-3xl pointer-events-none glow-drift" aria-hidden />

        <div className="reveal relative max-w-3xl mx-auto text-center space-y-8">
          <h2 className="font-display text-4xl md:text-6xl font-bold">
            Your first sale is{" "}
            <span className="gradient-text">minutes away</span>
          </h2>
          <p className="text-xl text-muted-foreground leading-relaxed">
            Connect a wallet, publish something, share the link. That is the whole setup.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
            <Link
              href="/dashboard"
              className="shimmer-btn px-10 py-5 text-white rounded-full font-bold text-lg flex items-center gap-2"
            >
              Start selling <ArrowRight className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </section>

      {/* ============================================
          FOOTER
          ============================================ */}
      <footer className="py-16 px-6 border-t border-border">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-4 gap-12 mb-12">
            <div className="col-span-2 space-y-5">
              <div className="flex items-center gap-3">
                <Image src="/logo.png" alt="SuperPage" width={40} height={40} className="h-10 w-auto" />
                <span className="text-xl font-bold tracking-tight">SuperPage</span>
              </div>
              <p className="text-muted-foreground max-w-sm leading-relaxed">
                The creator marketplace for humans and AI agents. Videos, articles, files, and
                APIs, paid per use with HTTP 402 USDC payments on Arc.
              </p>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-sp-blue/10 text-sp-blue text-xs font-bold">
                Built on Arc, Circle&apos;s stablecoin-native chain
              </div>
            </div>
            <div className="space-y-5">
              <h6 className="font-bold text-foreground">Platform</h6>
              <ul className="space-y-3 text-muted-foreground font-medium">
                <li><Link href="/dashboard" className="hover:text-primary transition-colors">Dashboard</Link></li>
                <li><Link href="/explore" className="hover:text-primary transition-colors">Explore</Link></li>
                <li><Link href="/docs" className="hover:text-primary transition-colors">Documentation</Link></li>
                <li><Link href="/creators" className="hover:text-primary transition-colors">Creators</Link></li>
              </ul>
            </div>
            <div className="space-y-5">
              <h6 className="font-bold text-foreground">Resources</h6>
              <ul className="space-y-3 text-muted-foreground font-medium">
                <li><Link href="/docs/getting-started" className="hover:text-primary transition-colors">Getting Started</Link></li>
                <li><Link href="/faucet" className="hover:text-primary transition-colors">Faucet</Link></li>
                <li><Link href="/docs" className="hover:text-primary transition-colors">API Reference</Link></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-border flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-muted-foreground text-sm">&copy; 2026 SuperPage. All rights reserved.</p>
            <p className="text-muted-foreground text-sm font-medium">HTTP 402 Payment Protocol</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

/**
 * LeptonMeter — a small, self-contained hero device that shows a price
 * dividing down toward the smallest billable unit. It cycles through real
 * SuperPage pricing shapes (per article, per second, per call) and lands on
 * a sub-cent figure, making the nanopayment thesis tangible. Pure CSS motion
 * driven by an interval; respects prefers-reduced-motion via the CSS reset.
 */
const LEPTON_STEPS = [
  { unit: "per article", price: "$0.05" },
  { unit: "per second", price: "$0.004" },
  { unit: "per API call", price: "$0.0007" },
  { unit: "per request", price: "$0.0002" },
];

function LeptonMeter() {
  const [i, setI] = useState(0);
  const reduced = useRef(false);

  useEffect(() => {
    reduced.current =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced.current) return;
    const id = setInterval(() => setI((n) => (n + 1) % LEPTON_STEPS.length), 1900);
    return () => clearInterval(id);
  }, []);

  const step = LEPTON_STEPS[i];

  return (
    <div className="inline-flex items-center gap-4 rounded-2xl border border-border bg-card/80 backdrop-blur px-5 py-4 shadow-sm">
      {/* The dividing coin */}
      <div className="relative size-11 shrink-0">
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-sp-gold/30 to-sp-coral/20 lepton-divide" />
        <div className="absolute inset-0 flex items-center justify-center">
          <CircleDollarSign className="h-5 w-5 text-sp-gold" />
        </div>
      </div>
      <div className="text-left tabular-nums">
        <p
          key={step.price}
          className="tick-pop font-mono text-2xl font-bold leading-none text-foreground"
        >
          {step.price}
        </p>
        <p className="text-xs text-muted-foreground mt-1.5">{step.unit}</p>
      </div>
      <div className="hidden sm:block w-px self-stretch bg-border" aria-hidden />
      <p className="hidden sm:block text-xs text-muted-foreground max-w-[9rem] leading-snug">
        No minimum. The floor is gone.
      </p>
    </div>
  );
}

/** Loading placeholder matching ProductCard's shape (4:3 cover + body). */
function FeaturedSkeleton() {
  return (
    <div className="flex flex-col rounded-2xl bg-card border border-border overflow-hidden">
      <div className="aspect-[4/3] skeleton" />
      <div className="flex flex-col gap-2.5 p-4">
        <div className="h-4 w-4/5 rounded skeleton" />
        <div className="h-3 w-1/3 rounded skeleton" />
        <div className="mt-3 h-7 w-16 rounded-lg skeleton" />
      </div>
    </div>
  );
}
