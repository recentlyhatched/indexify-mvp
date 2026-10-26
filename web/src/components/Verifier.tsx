"use client";
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, FileUp, SearchX, ShieldCheck, XCircle } from "lucide-react";
import { canonicalizeRecord, sha256Hex } from "@/lib/canonical";
import { txLink } from "@/lib/config";
import { buttonClass, cx, fileInputClass, inputClass, labelClass } from "./ui";

type Result = {
  result: "MATCH" | "MISMATCH" | "NOT_FOUND" | "UNAVAILABLE" | null;
  message?: string;
  recordType?: string;
  status?: string | null;
  issuedAt?: string | null;
  expiresAt?: string | null;
  revokedAt?: string | null;
  anchoredAt?: string | null;
  anchoredHash?: string;
  documentHash?: string | null;
  txHash?: string | null;
  comparedAgainst?: string | null;
  network?: string;
  contractId?: string;
};

type Mode = "status" | "record" | "document";

const RESULT_STYLE = {
  MATCH: { box: "border-success-500/30 bg-success-50", title: "text-success", icon: CheckCircle2, iconBg: "bg-success-500", label: "MATCH", text: "The record matches what is stored on Stellar." },
  MISMATCH: { box: "border-danger/30 bg-danger-50", title: "text-danger", icon: XCircle, iconBg: "bg-danger", label: "MISMATCH", text: "The supplied content differs from what was anchored. It has been altered or is a different record." },
  NOT_FOUND: { box: "border-line bg-paper", title: "text-ink", icon: SearchX, iconBg: "bg-muted", label: "NOT FOUND", text: "No record with this ID exists in the PensionBridge contract." },
  UNAVAILABLE: { box: "border-warning-500/30 bg-warning-50", title: "text-warning", icon: AlertTriangle, iconBg: "bg-warning-500", label: "UNAVAILABLE", text: "The network could not be reached. No integrity result has been established." },
  FOUND: { box: "border-primary-100 bg-primary-50", title: "text-primary", icon: ShieldCheck, iconBg: "bg-primary", label: "RECORD FOUND", text: "This record is anchored on Stellar. Paste the record or upload the document to check its integrity." },
} as const;

const fmt = (iso: string | null | undefined) => (iso ? iso.replace("T", " ").slice(0, 16) + " UTC" : null);

/** Public verifier. Hashes are computed locally — record contents and files never leave the browser. */
export function Verifier({ initialId }: { initialId?: string }) {
  const [id, setId] = useState(initialId ?? "");
  const [tab, setTab] = useState<"id" | "document">("id");
  const [text, setText] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [localHash, setLocalHash] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);

  useEffect(() => {
    if (initialId) void check("status");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialId]);

  async function check(m: Mode) {
    setErr(null);
    setRes(null);
    setLocalHash(null);
    setBusy(true);
    try {
      let hash: string | null = null;
      let against = "payload";
      let ref = id.trim();
      if (m === "record") {
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch {
          throw new Error("Not valid JSON");
        }
        const rid = (parsed as { record_id?: string }).record_id;
        if (!ref && rid) {
          ref = rid;
          setId(rid);
        }
        const out = await canonicalizeRecord(parsed).catch((e: unknown) => {
          throw new Error(`Record does not match the PensionBridge schema: ${e instanceof Error ? e.message.slice(0, 200) : e}`);
        });
        hash = out.hash;
        if (rid && ref && rid !== ref.toLowerCase()) throw new Error("This record's record_id does not match the reference you entered");
      } else if (m === "document") {
        if (!file) throw new Error("Choose the original document file");
        hash = await sha256Hex(new Uint8Array(await file.arrayBuffer()));
        against = "document";
      }
      if (!ref) throw new Error("Enter a record ID");
      setLocalHash(hash);
      const qs = new URLSearchParams({ id: ref, ...(hash ? { hash, against } : {}) });
      const r = await fetch(`/api/public/verify?${qs}`);
      if (!r.ok) throw new Error("verification service error");
      setRes(await r.json());
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === "verification service error" || msg === "Failed to fetch") setRes({ result: "UNAVAILABLE", message: "The verification service could not be reached." });
      else setErr(msg);
    } finally {
      setBusy(false);
    }
  }

  function submit() {
    if (tab === "document") return check("document");
    return check(text.trim() ? "record" : "status");
  }

  const style = res ? RESULT_STYLE[res.result ?? "FOUND"] : null;
  const valid = res?.status === "active" || res?.status === "anchored";

  return (
    <div>
      <div className="grid grid-cols-2 rounded-lg bg-paper p-1 text-[13.5px] font-medium">
        {([["id", "Search by Record ID"], ["document", "Upload Document"]] as const).map(([k, l]) => (
          <button key={k} onClick={() => { setTab(k); setRes(null); setErr(null); }} className={cx("rounded-md py-2 transition", tab === k ? "bg-white text-primary shadow-[0_1px_3px_rgba(23,20,44,0.1)]" : "text-muted hover:text-ink")}>
            {l}
          </button>
        ))}
      </div>

      <div className="mt-4 flex gap-2">
        <input className={cx(inputClass, "hash text-[13px]")} placeholder="Record ID (64 characters)" value={id} onChange={(e) => setId(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} aria-label="Record ID" />
        <button className={cx(buttonClass("primary"), "px-7")} disabled={busy} onClick={submit}>{busy ? "Checking…" : "Verify"}</button>
      </div>

      {tab === "id" && (
        <div className="mt-3">
          {!showPaste ? (
            <button onClick={() => setShowPaste(true)} className="text-[12.5px] font-medium text-primary hover:text-primary-600">+ Check a copy of the record for tampering</button>
          ) : (
            <div>
              <label className={labelClass}>Canonical record (JSON)</label>
              <textarea className={cx(inputClass, "hash h-36 text-[11.5px] leading-relaxed")} placeholder='{"amount":{"currency":"KES","value":"25000000.00"}, …}' value={text} onChange={(e) => setText(e.target.value)} />
              <div className="mt-2 flex items-center gap-3 text-[12px] text-muted">
                <label className={cx(buttonClass("secondary", "sm"), "cursor-pointer")}>
                  <FileUp className="h-3.5 w-3.5" /> Load .json file
                  <input type="file" accept=".json,application/json" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setText(await f.text()); }} />
                </label>
                Canonicalized and hashed in your browser.
              </div>
            </div>
          )}
        </div>
      )}
      {tab === "document" && (
        <div className="mt-3">
          <input type="file" className={fileInputClass} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <p className="mt-1.5 text-[12px] text-muted">The SHA-256 of the exact file bytes is compared with the document hash registered on-chain. The file never leaves your browser.</p>
        </div>
      )}

      {err && <p className="mt-4 rounded-lg bg-danger-50 px-3 py-2 text-[13px] text-danger">{err}</p>}

      {res && style && (
        <div className={cx("mt-5 rounded-xl border p-5", style.box)}>
          <div className="flex items-start gap-3">
            <span className={cx("grid h-9 w-9 shrink-0 place-items-center rounded-full text-white", style.iconBg)}><style.icon className="h-5 w-5" /></span>
            <div>
              <div className={cx("text-[16px] font-bold", style.title)}>{style.label}</div>
              <p className="mt-0.5 text-[13px] text-body">{res.message ?? style.text}</p>
            </div>
          </div>
          {res.recordType && (
            <dl className="mt-4 divide-y divide-black/5 text-[13px]">
              <Row k="Record ID" v={<span className="hash break-all">{id}</span>} />
              <Row k="Record Type" v={res.recordType} />
              {res.documentHash && <Row k="Document Hash" v={<span className="hash break-all">{res.documentHash}</span>} />}
              <Row k="Anchored Hash" v={<span className="hash break-all">{res.anchoredHash}</span>} />
              {res.txHash && <Row k="Stellar Transaction" v={<a className="hash link break-all" href={txLink(res.txHash)} target="_blank" rel="noreferrer">{res.txHash.slice(0, 10)}…{res.txHash.slice(-6)} ↗</a>} />}
              {(res.anchoredAt || res.issuedAt) && <Row k="Timestamp" v={fmt(res.anchoredAt ?? res.issuedAt)} />}
              {res.expiresAt && <Row k="Expires" v={fmt(res.expiresAt)} />}
              {res.revokedAt && <Row k="Revoked" v={fmt(res.revokedAt)} />}
              <Row k="Network" v={`Stellar ${res.network ?? "testnet"}`} />
              {res.status && (
                <Row k="Status" v={<span className={cx("font-semibold", valid ? "text-success" : "text-danger")}>{valid ? "Valid" : `${res.status.charAt(0).toUpperCase()}${res.status.slice(1)} — not valid for new reliance`}</span>} />
              )}
            </dl>
          )}
          {localHash && <p className="hash mt-3 break-all text-[11px] text-muted">Local SHA-256: {localHash}</p>}
        </div>
      )}

      <p className="mt-5 text-[12px] leading-relaxed text-faint">Integrity verification only. A match does not mean an investment is compliant or legally eligible.</p>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-3 py-2">
      <dt className="text-muted">{k}</dt>
      <dd className="min-w-0 font-medium text-ink">{v}</dd>
    </div>
  );
}
