"use client";
import { useState } from "react";
import { api, signXdr } from "@/lib/wallet";

export type PrepareResult =
  | { state: "confirmed" }
  | { state: "in_flight"; message: string }
  | { state: "ready"; chainTxId: string; xdr: string; txHash: string };

export type ChainPhase = "idle" | "preparing" | "signing" | "submitting" | "confirmed" | "failed" | "unknown";

/**
 * Drives prepare → Freighter sign → submit for any contract operation.
 * The server prepares the transaction from stored state; the browser only signs it.
 */
export function useChainSigner(wallet: string | null) {
  const [phase, setPhase] = useState<ChainPhase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  async function run(prepareFn: () => Promise<PrepareResult>, opts: { simulateTimeout?: boolean } = {}) {
    if (!wallet) {
      setPhase("failed");
      setMessage("Connect your Freighter wallet first");
      return "failed" as const;
    }
    setMessage(null);
    setTxHash(null);
    try {
      setPhase("preparing");
      const prep = await prepareFn();
      if (prep.state === "confirmed") {
        setPhase("confirmed");
        setMessage("Already confirmed on-chain — reconciled without a new transaction.");
        return "confirmed" as const;
      }
      if (prep.state === "in_flight") {
        setPhase("unknown");
        setMessage(prep.message);
        return "unknown" as const;
      }
      setTxHash(prep.txHash);
      setPhase("signing");
      const signedXdr = await signXdr(prep.xdr, wallet);
      setPhase("submitting");
      const res = await api<{ status: "confirmed" | "failed" | "unknown"; txHash: string; error?: string }>("/api/chain/submit", {
        chainTxId: prep.chainTxId,
        signedXdr,
        simulateTimeout: opts.simulateTimeout,
      });
      setTxHash(res.txHash);
      setPhase(res.status);
      setMessage(res.error ?? (res.status === "confirmed" ? "Confirmed on Stellar Testnet." : null));
      return res.status;
    } catch (e) {
      setPhase("failed");
      setMessage(e instanceof Error ? e.message : String(e));
      return "failed" as const;
    }
  }

  return { phase, message, txHash, run, busy: phase === "preparing" || phase === "signing" || phase === "submitting" };
}
