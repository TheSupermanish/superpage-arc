"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  Globe,
  Github,
  Twitter,
  Package,
  Copy,
  Check,
  Share2,
  BadgeCheck,
  Youtube,
  Linkedin,
  Instagram,
  Send,
  MessageCircle,
  Heart,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { useAccount, useWriteContract, useSwitchChain } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { parseUnits } from "viem";
import { PublicNavbar } from "@/components/public-navbar";
import { PurchaseModal, type PurchaseItem } from "@/components/purchase-modal";
import { ProductCard, type ProductCardItem, type ProductCardType } from "@/components/product-card";
import { ReputationBadge } from "@/components/reputation-badge";
import {
  getTxUrl,
  getAddressUrl,
  getCurrency,
  getPaymentTokenAddress,
  getPaymentTokenDecimals,
} from "@/lib/chain-config";
import { getDefaultChainId } from "@/lib/chains";

const TIP_CHAIN_ID = getDefaultChainId();
const PAYMENT_TOKEN_ADDRESS = getPaymentTokenAddress();
const PAYMENT_TOKEN_DECIMALS = getPaymentTokenDecimals();
const CURRENCY = getCurrency();
const ERC20_ABI = [
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface Profile {
  username: string;
  displayName?: string;
  avatarUrl?: string;
  bio?: string;
  website?: string;
  walletAddress?: string;
  socialLinks?: {
    twitter?: string;
    github?: string;
    discord?: string;
    youtube?: string;
    linkedin?: string;
    instagram?: string;
    telegram?: string;
  };
  isAgent?: boolean;
  erc8004AgentId?: number | null;
  stats?: {
    totalSales: number;
    totalRevenue: number;
  } | null;
}

interface Store {
  id: string;
  name: string;
  shopDomain?: string;
  description?: string;
  productCount: number;
}

interface Product {
  _id: string;
  id: string;
  storeId: string;
  name: string;
  description?: string;
  image?: string;
  price: string;
  currency: string;
  inventory?: number;
}

interface Resource {
  id: string;
  slug?: string;
  type: string;
  name: string;
  description?: string;
  price: number;
  accessCount: number;
}

interface ProfileData {
  profile: Profile;
  content: {
    stores: Store[];
    products: Product[];
    resources: Resource[];
  };
}

export default function PublicProfilePage() {
  const params = useParams();
  const username = params.username as string;

  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedWallet, setCopiedWallet] = useState(false);
  const [purchaseItem, setPurchaseItem] = useState<PurchaseItem | null>(null);
  const [purchaseOpen, setPurchaseOpen] = useState(false);

  // Tip state
  const [tipOpen, setTipOpen] = useState(false);
  const [tipAmount, setTipAmount] = useState("");
  const [tipStatus, setTipStatus] = useState<"idle" | "switching" | "sending" | "success" | "error">("idle");
  const [tipTxHash, setTipTxHash] = useState<string | null>(null);
  const [tipError, setTipError] = useState<string | null>(null);

  const { address: senderAddress, isConnected, chainId } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  const handleTip = async (amount: string) => {
    if (!isConnected || !senderAddress) {
      openConnectModal?.();
      return;
    }
    if (!data?.profile.walletAddress) return;

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) return;

    setTipStatus("idle");
    setTipError(null);
    setTipTxHash(null);

    try {
      // Switch to payment chain if needed
      if (chainId !== TIP_CHAIN_ID) {
        setTipStatus("switching");
        await switchChainAsync({ chainId: TIP_CHAIN_ID });
      }

      // Send USDC transfer
      setTipStatus("sending");
      const hash = await writeContractAsync({
        address: PAYMENT_TOKEN_ADDRESS,
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [
          data.profile.walletAddress as `0x${string}`,
          parseUnits(amount, PAYMENT_TOKEN_DECIMALS),
        ],
        chainId: TIP_CHAIN_ID,
      });

      setTipTxHash(hash);
      setTipStatus("success");
    } catch (err: any) {
      const msg = err?.message || "Transaction failed";
      if (msg.includes("User rejected") || msg.includes("denied")) {
        setTipStatus("idle");
      } else {
        setTipError(msg.length > 60 ? msg.slice(0, 60) + "..." : msg);
        setTipStatus("error");
      }
    }
  };

  useEffect(() => {
    if (!username) return;

    const fetchProfile = async () => {
      try {
        const res = await fetch(`${API_URL}/@${username}`);

        if (!res.ok) {
          setError(res.status === 404 ? "Profile not found" : "Failed to load profile");
          return;
        }

        const profileData = await res.json();
        setData(profileData);
      } catch (err) {
        console.error("Fetch profile error:", err);
        setError("Failed to load profile");
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [username]);

  const copyWalletAddress = () => {
    if (data?.profile.walletAddress) {
      navigator.clipboard.writeText(data.profile.walletAddress);
      setCopiedWallet(true);
      setTimeout(() => setCopiedWallet(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-foreground mb-4">404</h1>
          <p className="text-xl text-muted-foreground mb-8">{error || "Profile not found"}</p>
          <Link href="/">
            <button className="px-6 py-3 bg-primary text-primary-foreground rounded-2xl font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/10">
              Go Home
            </button>
          </Link>
        </div>
      </div>
    );
  }

  const { profile, content } = data;
  const displayName = profile.displayName || profile.username;
  const initial = displayName.charAt(0).toUpperCase();

  const toCardItem = (r: Resource): ProductCardItem => ({
    id: r.id,
    slug: r.slug,
    type: (["api", "file", "article", "video", "shopify"].includes(r.type)
      ? r.type
      : "api") as ProductCardType,
    name: r.name,
    description: r.description,
    priceUsdc: r.price,
    creator: { username: profile.username },
  });

  const socialIcon = (href: string, icon: React.ReactNode, label: string) => (
    <a
      key={label}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={label}
      className="size-9 flex items-center justify-center rounded-full bg-card border border-border hover:border-primary hover:bg-primary/10 text-muted-foreground hover:text-primary transition-all"
    >
      {icon}
    </a>
  );
  const links = profile.socialLinks;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PublicNavbar />

      {/* Header band */}
      <header className="border-b border-border bg-secondary/40 pt-28 pb-12">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex flex-col md:flex-row md:items-center gap-6">
            {/* Avatar */}
            {profile.avatarUrl ? (
              <div
                className="size-24 rounded-full bg-cover bg-center ring-4 ring-primary/10 shrink-0"
                style={{ backgroundImage: `url(${profile.avatarUrl})` }}
              />
            ) : (
              <div className="size-24 rounded-full bg-primary/15 text-primary flex items-center justify-center font-bold text-4xl ring-4 ring-primary/10 shrink-0">
                {initial}
              </div>
            )}

            {/* Identity */}
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight">{displayName}</h1>
                <span className="text-primary font-mono text-sm">@{profile.username}</span>
                {profile.erc8004AgentId != null && profile.erc8004AgentId > 0 && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/30 text-primary text-xs font-semibold">
                    <BadgeCheck className="h-3.5 w-3.5" />
                    On-chain Agent #{profile.erc8004AgentId}
                  </span>
                )}
                <ReputationBadge username={profile.username} />
              </div>
              {profile.bio && (
                <p className="text-muted-foreground leading-relaxed max-w-2xl">{profile.bio}</p>
              )}
              <div className="flex items-center gap-4 flex-wrap pt-1">
                {profile.stats && (
                  <span className="text-sm text-muted-foreground">
                    <span className="font-bold text-foreground">{profile.stats.totalSales}</span>{" "}
                    {profile.stats.totalSales === 1 ? "sale" : "sales"}
                  </span>
                )}
                {profile.walletAddress && (
                  <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                    <a
                      href={getAddressUrl(profile.walletAddress)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono hover:text-foreground transition-colors inline-flex items-center gap-1"
                    >
                      {profile.walletAddress.slice(0, 6)}...{profile.walletAddress.slice(-4)}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    <button
                      onClick={copyWalletAddress}
                      className="hover:text-foreground transition-colors"
                      title="Copy wallet address"
                    >
                      {copiedWallet ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </span>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 shrink-0">
              {(profile.website || links?.twitter || links?.github || links?.discord || links?.youtube || links?.linkedin || links?.instagram || links?.telegram) && (
                <div className="flex flex-wrap gap-2">
                  {profile.website && socialIcon(profile.website, <Globe className="h-4 w-4" />, "Website")}
                  {links?.twitter && socialIcon(links.twitter.startsWith("http") ? links.twitter : `https://twitter.com/${links.twitter}`, <Twitter className="h-4 w-4" />, "Twitter")}
                  {links?.github && socialIcon(links.github.startsWith("http") ? links.github : `https://github.com/${links.github}`, <Github className="h-4 w-4" />, "GitHub")}
                  {links?.youtube && socialIcon(links.youtube.startsWith("http") ? links.youtube : `https://youtube.com/@${links.youtube}`, <Youtube className="h-4 w-4" />, "YouTube")}
                  {links?.linkedin && socialIcon(links.linkedin.startsWith("http") ? links.linkedin : `https://linkedin.com/in/${links.linkedin}`, <Linkedin className="h-4 w-4" />, "LinkedIn")}
                  {links?.instagram && socialIcon(links.instagram.startsWith("http") ? links.instagram : `https://instagram.com/${links.instagram}`, <Instagram className="h-4 w-4" />, "Instagram")}
                  {links?.telegram && socialIcon(links.telegram.startsWith("http") ? links.telegram : `https://t.me/${links.telegram}`, <Send className="h-4 w-4" />, "Telegram")}
                  {links?.discord && socialIcon(links.discord.startsWith("http") ? links.discord : `https://discord.gg/${links.discord}`, <MessageCircle className="h-4 w-4" />, "Discord")}
                </div>
              )}
              <button
                onClick={() => {
                  if (navigator.share) {
                    navigator.share({
                      title: `${displayName} on SuperPage`,
                      url: window.location.href,
                    });
                  } else {
                    navigator.clipboard.writeText(window.location.href);
                  }
                }}
                title="Share"
                className="size-9 flex items-center justify-center rounded-full bg-card border border-border hover:border-primary hover:bg-primary/10 transition-all text-muted-foreground hover:text-primary"
              >
                <Share2 className="h-4 w-4" />
              </button>
              {profile.walletAddress && (
                <button
                  onClick={() => setTipOpen(true)}
                  className="px-5 py-2.5 rounded-full font-bold text-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-all flex items-center gap-2 shadow-lg shadow-primary/10"
                >
                  <Heart className="h-4 w-4" />
                  Tip
                </button>
              )}
            </div>
          </div>

          {/* Tip panel */}
          {tipOpen && profile.walletAddress && (
            <div className="mt-6 max-w-md p-5 rounded-2xl bg-card border border-primary/30 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-foreground flex items-center gap-2">
                  <Heart className="h-4 w-4 text-primary" />
                  Tip {displayName}
                </h3>
                <button
                  onClick={() => { setTipOpen(false); setTipStatus("idle"); setTipError(null); setTipTxHash(null); setTipAmount(""); }}
                  className="text-muted-foreground hover:text-foreground text-sm"
                >
                  Cancel
                </button>
              </div>

              {tipStatus === "success" ? (
                <div className="text-center py-4 space-y-3">
                  <div className="size-14 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
                    <Check className="h-7 w-7 text-green-500" />
                  </div>
                  <p className="font-bold text-foreground">Tip sent!</p>
                  <p className="text-sm text-muted-foreground">${tipAmount} {CURRENCY} to {displayName}</p>
                  {tipTxHash && (
                    <a
                      href={getTxUrl(tipTxHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      View on Arcscan <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              ) : (
                <>
                  {/* Preset amounts */}
                  <div className="grid grid-cols-4 gap-2">
                    {["1", "2", "5", "10"].map((amt) => (
                      <button
                        key={amt}
                        onClick={() => setTipAmount(amt)}
                        className={`py-2.5 rounded-xl text-sm font-bold transition-all ${
                          tipAmount === amt
                            ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                            : "bg-muted text-foreground hover:bg-primary/10 border border-border"
                        }`}
                      >
                        ${amt}
                      </button>
                    ))}
                  </div>

                  {/* Custom amount */}
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder="Custom amount"
                      value={tipAmount}
                      onChange={(e) => setTipAmount(e.target.value)}
                      className="w-full pl-7 pr-16 py-2.5 rounded-xl bg-muted border border-border text-foreground text-sm focus:border-primary focus:outline-none"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">{CURRENCY}</span>
                  </div>

                  {tipError && <p className="text-xs text-red-500">{tipError}</p>}

                  {/* Send button */}
                  <button
                    onClick={() => handleTip(tipAmount)}
                    disabled={!tipAmount || parseFloat(tipAmount) <= 0 || tipStatus === "sending" || tipStatus === "switching"}
                    className="w-full py-3 rounded-xl font-bold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                  >
                    {tipStatus === "switching" ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Switching network...</>
                    ) : tipStatus === "sending" ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Confirm in wallet...</>
                    ) : !isConnected ? (
                      <>Connect Wallet to Tip</>
                    ) : (
                      <>Send ${tipAmount || "0"} {CURRENCY}</>
                    )}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Products */}
      <main className="max-w-6xl mx-auto px-6 py-12 space-y-14">
        <section className="space-y-6">
          <h2 className="text-xl font-bold tracking-tight">Products</h2>
          {content.resources.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {content.resources.map((resource) => (
                <ProductCard key={resource.id} item={toCardItem(resource)} />
              ))}
            </div>
          ) : (
            <div className="w-full p-12 rounded-2xl bg-card border border-border text-center">
              <div className="size-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Package className="h-8 w-8 text-primary/50" />
              </div>
              <p className="text-muted-foreground text-sm">Nothing for sale yet</p>
              <p className="text-muted-foreground text-xs mt-1">Check back soon for videos, articles, files, and APIs</p>
            </div>
          )}
        </section>

        {/* Store products */}
        {content.products.length > 0 && (
          <section className="space-y-6">
            <h2 className="text-xl font-bold tracking-tight">Store products</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {content.products.slice(0, 8).map((product) => (
                <div
                  key={product._id}
                  onClick={() => {
                    setPurchaseItem({
                      kind: "product",
                      data: {
                        id: product.id || product._id,
                        storeId: product.storeId,
                        name: product.name,
                        description: product.description || null,
                        image: product.image || null,
                        price: product.price,
                        currency: product.currency,
                        inventory: product.inventory ?? null,
                      },
                    });
                    setPurchaseOpen(true);
                  }}
                  className="aspect-square rounded-2xl overflow-hidden relative group cursor-pointer border border-border bg-card hover:border-primary hover:shadow-xl hover:shadow-primary/5 transition-all"
                >
                  {product.image ? (
                    <Image
                      src={product.image}
                      alt={product.name}
                      fill
                      className="object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-primary/10">
                      <Package className="h-12 w-12 text-primary/60" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/40 to-transparent flex flex-col justify-end p-4">
                    <p className="text-sm font-bold text-foreground truncate">{product.name}</p>
                    <p className="text-xs text-muted-foreground">${parseFloat(product.price).toFixed(2)}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Footer */}
        <footer className="flex flex-col items-center gap-2 pt-8 pb-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <div className="size-8 rounded-full bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-sm">S</span>
            </div>
            <span className="text-sm font-bold">SuperPage</span>
          </div>
          <p className="text-xs text-muted-foreground">Join {profile.username} on SuperPage today</p>
        </footer>
      </main>

      <PurchaseModal
        open={purchaseOpen}
        onOpenChange={(open) => {
          setPurchaseOpen(open);
          if (!open) setPurchaseItem(null);
        }}
        item={purchaseItem}
      />
    </div>
  );
}
