"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/wallet";
import { sha256Hex } from "@/lib/canonical";
import { DOCUMENT_TYPES, REVIEW_SCOPES, type AttestationType } from "@/lib/requirements";
import { useChainSigner, type PrepareResult } from "./useChainSigner";
import { ChainStatus } from "./ChainStatus";
import { buttonClass, cx, fileInputClass, inputClass, labelClass } from "./ui";

const input = inputClass;
const label = labelClass;

export function UploadDocument({ productId }: { productId: string }) {
  const router = useRouter();
  const [type, setType] = useState("prospectus");
  const [file, setFile] = useState<File | null>(null);
  const [localHash, setLocalHash] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function pick(f: File | null) {
    setFile(f);
    setMsg(null);
    setLocalHash(f ? await sha256Hex(new Uint8Array(await f.arrayBuffer())) : null);
  }

  async function upload() {
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("productId", productId);
      fd.set("documentType", type);
      fd.set("file", file);
      const r = await api<{ version: number; sha256: string }>("/api/documents", fd);
      setMsg({ ok: r.sha256 === localHash, text: `Registered as v${r.version}. Server hash ${r.sha256 === localHash ? "matches" : "DIFFERS FROM"} your browser's hash.` });
      router.refresh();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={label}>Document type</label>
          <select className={input} value={type} onChange={(e) => setType(e.target.value)}>
            {Object.entries(DOCUMENT_TYPES).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>File (hashed over its exact bytes)</label>
          <input type="file" className={fileInputClass} onChange={(e) => pick(e.target.files?.[0] ?? null)} />
        </div>
      </div>
      {localHash && <div className="hash break-all text-muted">SHA-256 (computed locally): {localHash}</div>}
      <button className={buttonClass()} disabled={!file || busy} onClick={upload}>
        {busy ? "Registering…" : "Register document version"}
      </button>
      {msg && <p className={cx("text-sm", msg.ok ? "text-ink" : "text-danger")}>{msg.text}</p>}
    </div>
  );
}

type DocOption = { id: string; label: string };

export function IssueAttestation({ productId, wallet, type, documents }: { productId: string; wallet: string; type: AttestationType; documents: DocOption[] }) {
  const router = useRouter();
  const scopes = REVIEW_SCOPES[type];
  const [documentId, setDocumentId] = useState(documents[0]?.id ?? "");
  const [scope, setScope] = useState(Object.keys(scopes)[0]);
  const [claim, setClaim] = useState(
    type === "provider_declaration"
      ? "We declare that the attached documentation accurately describes the fund's legal structure and investor rights."
      : "An independent review of this document was performed against the scheme's Kenyan pension eligibility checklist. This is not a legal approval.",
  );
  const [expiry, setExpiry] = useState("43200");
  const signer = useChainSigner(wallet);

  async function issue() {
    const res = await signer.run(async () => {
      const r = await api<{ recordId: string; chain: PrepareResult }>("/api/attestations", {
        productId,
        documentId,
        type,
        scope,
        claim,
        expiresInMinutes: expiry === "none" ? null : Number(expiry),
      });
      return r.chain;
    });
    router.refresh();
    return res;
  }

  if (!documents.length) return <p className="text-sm text-muted">Register a document first.</p>;
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={label}>Document version</label>
          <select className={input} value={documentId} onChange={(e) => setDocumentId(e.target.value)}>
            {documents.map((d) => (
              <option key={d.id} value={d.id}>{d.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>Review scope</label>
          <select className={input} value={scope} onChange={(e) => setScope(e.target.value)}>
            {Object.entries(scopes).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className={label}>Claim</label>
        <textarea className={cx(input, "min-h-20")} value={claim} onChange={(e) => setClaim(e.target.value)} />
      </div>
      <div className="sm:w-1/2">
        <label className={label}>Expiry</label>
        <select className={input} value={expiry} onChange={(e) => setExpiry(e.target.value)}>
          <option value="3">3 minutes (demo expiry)</option>
          <option value="1440">1 day</option>
          <option value="43200">30 days</option>
          <option value="525600">1 year</option>
          <option value="none">No expiry</option>
        </select>
      </div>
      <button className={buttonClass()} disabled={signer.busy || claim.length < 10} onClick={issue}>
        {signer.busy ? "Working…" : "Sign & register on Stellar"}
      </button>
      <ChainStatus phase={signer.phase} message={signer.message} txHash={signer.txHash} />
    </div>
  );
}

/** Revoke an active attestation, or reconcile/retry one whose anchoring did not confirm. */
export function AttestationActions({ recordId, wallet, canRevoke, needsAnchoring }: { recordId: string; wallet: string; canRevoke: boolean; needsAnchoring: boolean }) {
  const router = useRouter();
  const signer = useChainSigner(wallet);
  const [simulateTimeout, setSimulateTimeout] = useState(false);

  async function retry() {
    await signer.run(async () => (await api<{ chain: PrepareResult }>("/api/chain/retry", { recordId, operation: "register_attestation" })).chain, { simulateTimeout });
    router.refresh();
  }
  async function revoke() {
    await signer.run(async () => (await api<{ chain: PrepareResult }>(`/api/attestations/${recordId}/revoke`)).chain);
    router.refresh();
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {needsAnchoring && (
          <>
            <button className={buttonClass("secondary")} disabled={signer.busy} onClick={retry}>Reconcile & retry anchoring</button>
            <label className="flex items-center gap-1.5 text-xs text-muted">
              <input type="checkbox" checked={simulateTimeout} onChange={(e) => setSimulateTimeout(e.target.checked)} /> Fault injection: simulate timeout
            </label>
          </>
        )}
        {canRevoke && (
          <button className={buttonClass("danger")} disabled={signer.busy} onClick={revoke}>Revoke</button>
        )}
      </div>
      <ChainStatus phase={signer.phase} message={signer.message} txHash={signer.txHash} />
    </div>
  );
}
