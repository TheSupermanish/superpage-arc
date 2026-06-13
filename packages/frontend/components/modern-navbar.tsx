"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { WalletConnect } from "./wallet-connect";
import { ThemeToggle } from "./theme-toggle";
import { useAuth } from "./providers/auth-provider";
import { cn } from "@/lib/utils";

export function ModernNavbar() {
  const pathname = usePathname();
  const { isAuthenticated } = useAuth();

  const navLinks = [
    { href: "/", label: "Home", show: true },
    { href: "/explore", label: "Explore", show: true },
    { href: "/docs", label: "Docs", show: true },
    { href: "/faucet", label: "Faucet", show: true },
    { href: "/dashboard", label: "Dashboard", show: isAuthenticated },
  ];

  return (
    <nav className="sticky top-0 z-50 bg-background/90 backdrop-blur-xl border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          <Link href="/" className="flex items-center gap-2.5 group">
            <Image src="/logo.png" alt="SuperPage" width={32} height={32} className="h-8 w-auto" />
            <span className="text-lg font-bold tracking-tight">
              Super<span className="text-primary">Page</span>
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-7">
            {navLinks.map((link) =>
              link.show ? (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "text-sm font-medium transition-colors",
                    pathname === link.href
                      ? "text-primary font-bold"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {link.label}
                </Link>
              ) : null
            )}
          </div>

          <div className="flex items-center gap-4">
            <ThemeToggle />
            {isAuthenticated ? (
              <>
                <Link
                  href="/dashboard"
                  className="hidden sm:block text-sm font-medium hover:text-primary transition-colors"
                >
                  Dashboard
                </Link>
                <WalletConnect compact />
              </>
            ) : (
              <WalletConnect />
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
