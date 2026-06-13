"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import {
  ENABLED_CHAINS,
  getSelectedNetwork,
  setSelectedNetwork,
  type ChainOption,
} from "@/lib/chain-config";

/**
 * Pay-on-chain selector. Lets the buyer choose which chain to settle USDC on.
 * Arc is the default. Pass `streamingOnly` to restrict to chains that support
 * the pay-per-second StreamPay channel (Arc only).
 */
export function ChainSelector({
  streamingOnly = false,
  onChange,
  className = "",
}: {
  streamingOnly?: boolean;
  onChange?: (network: string) => void;
  className?: string;
}) {
  const options: ChainOption[] = streamingOnly
    ? ENABLED_CHAINS.filter((c) => c.supportsStreaming)
    : ENABLED_CHAINS;

  const [selected, setSelected] = useState<string>(options[0]?.id || "arc-testnet");
  const [open, setOpen] = useState(false);

  // Read the persisted selection after mount (avoids SSR/client mismatch).
  useEffect(() => {
    const current = getSelectedNetwork();
    const valid = options.some((o) => o.id === current) ? current : options[0]?.id;
    if (valid) setSelected(valid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const choose = (network: string) => {
    setSelected(network);
    setSelectedNetwork(network);
    setOpen(false);
    onChange?.(network);
  };

  const active = options.find((o) => o.id === selected) || options[0];
  if (options.length <= 1) {
    // Nothing to choose (e.g. streaming is Arc-only): render a static label.
    return (
      <div className={`inline-flex items-center gap-2 text-sm text-muted-foreground ${className}`}>
        <span className="h-2 w-2 rounded-full bg-sp-gold" />
        {active?.label}
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium hover:border-foreground/30 transition-colors"
      >
        <span className="h-2 w-2 rounded-full bg-sp-gold" />
        {active?.label}
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 mt-2 w-56 rounded-xl border border-border bg-card p-1 shadow-xl">
            {options.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => choose(o.id)}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-foreground/5 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-sp-gold" />
                  {o.label}
                </span>
                {o.id === selected && <Check className="h-4 w-4 text-sp-blue" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
