"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/wallet";
import { useChainSigner, type PrepareResult } from "./useChainSigner";
import { ChainStatus } from "./ChainStatus";
import { buttonClass, inputClass } from "./ui";

const input = inputClass;

export function ClearCompliance({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function clear() {
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/requests/${requestId}/clear`, { notes: notes || null });
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3">
      <p className="text-[13px] text-muted">Clearance re-checks every required evidence item and confirms attestation status against the contract on Stellar.</p>
      <textarea className={input} rows={2} placeholder="Compliance notes (internal)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <button className={buttonClass()} disabled={busy} onClick={clear}>{busy ? "Checking evidence on-chain…" : "Record compliance clearance"}</button>
      {err && <p className="rounded-2xl border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] text-danger">{err}</p>}
    </div>
  );
}

export function CommitteeDecision({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [rationale, setRationale] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  async function decide(decision: "approved" | "rejected") {
    setBusy(decision);
    setErr(null);
    try {
      await api(`/api/requests/${requestId}/decide`, { decision, rationale: rationale || null });
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="space-y-3">
      <textarea className={input} rows={2} placeholder="Decision rationale (internal, not part of the hashed record)" value={rationale} onChange={(e) => setRationale(e.target.value)} />
      <div className="flex gap-2">
        <button className={buttonClass()} disabled={!!busy} onClick={() => decide("approved")}>{busy === "approved" ? "Re-checking evidence…" : "Approve"}</button>
        <button className={buttonClass("danger")} disabled={!!busy} onClick={() => decide("rejected")}>{busy === "rejected" ? "Recording…" : "Reject"}</button>
      </div>
      {err && <p className="rounded-2xl border border-danger/30 bg-danger/10 px-3 py-2 text-[13px] text-danger">{err}</p>}
    </div>
  );
}

export function AnchorApproval({ requestId, recordId, wallet, hasAttempts }: { requestId: string; recordId: string; wallet: string; hasAttempts: boolean }) {
  const router = useRouter();
  const signer = useChainSigner(wallet);
  const [simulateTimeout, setSimulateTimeout] = useState(false);

  async function anchor() {
    await signer.run(async () => (await api<{ chain: PrepareResult }>(`/api/requests/${requestId}/anchor`)).chain, { simulateTimeout });
    router.refresh();
  }
  async function reconcileOnly() {
    try {
      await api("/api/chain/reconcile", { recordId, operation: "register_approval" });
    } finally {
      router.refresh();
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-[13px] text-muted">Sign with your committee wallet to register the record hash on Soroban under its stable record ID. Retrying is safe: earlier attempts are reconciled first, and the contract rejects duplicates.</p>
      <div className="flex flex-wrap items-center gap-2">
        <button className={buttonClass()} disabled={signer.busy} onClick={anchor}>{hasAttempts ? "Reconcile & retry anchoring" : "Sign & anchor on Stellar"}</button>
        {hasAttempts && <button className={buttonClass("secondary")} disabled={signer.busy} onClick={reconcileOnly}>Check status only</button>}
      </div>
      <label className="flex items-center gap-1.5 text-xs text-muted">
        <input type="checkbox" checked={simulateTimeout} onChange={(e) => setSimulateTimeout(e.target.checked)} />
        Fault injection (demo): submit, then simulate a client timeout before confirmation
      </label>
      <ChainStatus phase={signer.phase} message={signer.message} txHash={signer.txHash} />
    </div>
  );
}
