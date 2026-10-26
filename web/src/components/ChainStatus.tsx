"use client";
import { txLink } from "@/lib/config";
import type { ChainPhase } from "./useChainSigner";
import { cx } from "./ui";

const LABEL: Record<ChainPhase, string> = {
  idle: "",
  preparing: "Preparing contract call & simulating on Testnet…",
  signing: "Approve the transaction in Freighter…",
  submitting: "Submitting to Stellar Testnet and awaiting confirmation…",
  confirmed: "Confirmed on-chain",
  failed: "Not completed",
  unknown: "Outcome uncertain — reconcile before retrying",
};

export function ChainStatus({ phase, message, txHash }: { phase: ChainPhase; message: string | null; txHash: string | null }) {
  if (phase === "idle") return null;
  const busy = phase === "preparing" || phase === "signing" || phase === "submitting";
  const tone =
    phase === "confirmed" ? "border-success-500/30 bg-success-50 text-success" : phase === "failed" ? "border-danger/30 bg-danger-50 text-danger" : "border-warning-500/30 bg-warning-50 text-[#7a4a06]";
  return (
    <div className={cx("mt-3 rounded-lg border px-3.5 py-3 text-[13px]", tone)} role="status" aria-live="polite">
      <div className="flex items-center gap-2 font-medium">
        {busy && <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />}
        {LABEL[phase]}
      </div>
      {message && <div className="mt-0.5 opacity-90">{message}</div>}
      {txHash && (
        <a href={txLink(txHash)} target="_blank" rel="noreferrer" className="hash mt-1 inline-block underline underline-offset-2">
          tx {txHash.slice(0, 12)}…{txHash.slice(-6)} ↗
        </a>
      )}
    </div>
  );
}
