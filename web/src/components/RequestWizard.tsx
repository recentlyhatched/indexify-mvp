"use client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Check, FileText, Plus, X } from "lucide-react";
import { api } from "@/lib/wallet";
import { buttonClass, cx, inputClass, labelClass } from "./ui";

type Product = { id: string; name: string; ticker: string | null };
const STEPS = ["Details", "Review", "Submit"];
const MAX_BYTES = 4 * 1024 * 1024;

function Stepper({ step }: { step: number }) {
  return (
    <ol className="flex items-center gap-3">
      {STEPS.map((s, i) => (
        <li key={s} className="flex flex-1 items-center gap-3 last:flex-none">
          <span className="flex items-center gap-2.5">
            <span
              className={cx(
                "grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12.5px] font-semibold",
                i < step ? "bg-primary text-white" : i === step ? "bg-primary text-white ring-4 ring-primary-100" : "border border-line bg-white text-muted",
              )}
            >
              {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span className={cx("text-[13px] font-medium", i <= step ? "text-ink" : "text-muted")}>{s}</span>
          </span>
          {i < STEPS.length - 1 && <span className={cx("h-px flex-1", i < step ? "bg-primary" : "bg-line")} />}
        </li>
      ))}
    </ol>
  );
}

const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Three-step submission: details → review → submit. Supporting files upload after the request is created. */
export function RequestWizard({ products, defaultProductId }: { products: Product[]; defaultProductId?: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(0);
  const [productId, setProductId] = useState(defaultProductId ?? "");
  const [currency, setCurrency] = useState("KES");
  const [amount, setAmount] = useState("25,000,000");
  const [rationale, setRationale] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const product = products.find((p) => p.id === productId);
  const cleanAmount = amount.replace(/[,\s]/g, "");
  const amountOk = /^\d{1,15}(\.\d{1,2})?$/.test(cleanAmount) && Number(cleanAmount) > 0;

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      if (f.size > MAX_BYTES) {
        setErr(`${f.name} is larger than 4 MB`);
        continue;
      }
      next.push(f);
    }
    setFiles(next);
  }

  function goReview() {
    setErr(null);
    if (!product) return setErr("Choose a product");
    if (!amountOk) return setErr("Enter a positive amount with at most two decimal places");
    setStep(1);
  }

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const { id } = await api<{ id: string }>("/api/requests", { productId, amount: cleanAmount, currency, rationale: rationale || null });
      const failed: string[] = [];
      for (const f of files) {
        const fd = new FormData();
        fd.set("file", f);
        await api(`/api/requests/${id}/attachments`, fd).catch(() => failed.push(f.name));
      }
      if (failed.length) {
        setErr(`Request submitted, but these files could not be attached: ${failed.join(", ")}`);
        setTimeout(() => router.push(`/requests/${id}`), 2500);
        return;
      }
      router.push(`/requests/${id}`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="max-w-[760px] rounded-xl border border-line bg-white p-5 shadow-[0_1px_3px_rgba(23,20,44,0.04)] md:p-7">
      <Stepper step={step} />
      <div className="mt-7">
        {step === 0 && (
          <div className="space-y-5">
            <div>
              <label className={labelClass} htmlFor="product">Product</label>
              <select id="product" className={inputClass} value={productId} onChange={(e) => setProductId(e.target.value)}>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}{p.ticker ? ` (${p.ticker})` : ""}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="amount">Investment Amount ({currency})</label>
              <div className="flex rounded-lg border border-line bg-white focus-within:border-primary/60 focus-within:ring-4 focus-within:ring-primary/10">
                <select aria-label="Currency" className="rounded-l-lg border-r border-line bg-paper px-3 text-[13px] font-semibold text-body outline-none" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                  <option>KES</option>
                  <option>USD</option>
                </select>
                <input id="amount" inputMode="decimal" className="w-full rounded-r-lg bg-transparent px-3 py-2.5 text-[13.5px] outline-none" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <p className="mt-1.5 text-[12px] text-muted">Hypothetical. Stored as a fixed-precision decimal; no order or transfer is created.</p>
            </div>
            <div>
              <label className={labelClass} htmlFor="rationale">Investment Rationale</label>
              <textarea id="rationale" rows={3} maxLength={2000} className={inputClass} placeholder="e.g. Diversifies the portfolio with U.S. equity exposure through a regulated tokenized fund." value={rationale} onChange={(e) => setRationale(e.target.value)} />
            </div>
            <div>
              <span className={labelClass}>Supporting Documents</span>
              <ul className="space-y-2">
                {files.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2.5">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-danger-50 text-danger"><FileText className="h-[18px] w-[18px]" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium text-ink">{f.name}</span>
                      <span className="block text-[11.5px] text-muted">{(f.name.split(".").pop() ?? "file").toUpperCase()} · {kb(f.size)}</span>
                    </span>
                    <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} className="rounded-md p-1 text-faint hover:bg-paper hover:text-ink" aria-label={`Remove ${f.name}`}>
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
              <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
              <button type="button" onClick={() => fileRef.current?.click()} className={cx(buttonClass("secondary", "sm"), "mt-2")}>
                <Plus className="h-3.5 w-3.5" /> {files.length ? "Add another document" : "Add document"}
              </button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div>
            <h2 className="text-[15px] font-semibold">Review your request</h2>
            <dl className="mt-3 divide-y divide-line rounded-lg border border-line px-4 text-[13px]">
              {[
                ["Product", product ? `${product.name}${product.ticker ? ` (${product.ticker})` : ""}` : "—"],
                ["Amount", `${currency} ${cleanAmount.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`],
                ["Rationale", rationale || "—"],
                ["Supporting documents", files.length ? files.map((f) => f.name).join(", ") : "None"],
              ].map(([k, v]) => (
                <div key={k} className="grid grid-cols-[160px_1fr] gap-3 py-2.5">
                  <dt className="text-muted">{k}</dt>
                  <dd className="font-medium break-words text-ink">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-[12.5px] text-muted">After submission the request moves to compliance review. Each step is enforced by the server; the final approval is anchored on Stellar.</p>
          </div>
        )}

        {step === 2 && (
          <div className="rounded-lg bg-primary-50 p-5">
            <h2 className="text-[15px] font-semibold text-ink">Ready to submit</h2>
            <p className="mt-1 text-[13px] text-body">
              {currency} {cleanAmount.replace(/\B(?=(\d{3})+(?!\d))/g, ",")} into {product?.name}. This is a hypothetical request for review only.
            </p>
          </div>
        )}
      </div>

      {err && <p className="mt-5 rounded-lg bg-danger-50 px-3 py-2 text-[13px] text-danger">{err}</p>}

      <div className="mt-7 flex items-center justify-between border-t border-line pt-5">
        {step > 0 ? (
          <button type="button" className={buttonClass("ghost")} disabled={busy} onClick={() => setStep(step - 1)}>Back</button>
        ) : (
          <span />
        )}
        {step === 0 && <button type="button" className={buttonClass()} onClick={goReview}>Continue</button>}
        {step === 1 && <button type="button" className={buttonClass()} onClick={() => setStep(2)}>Continue</button>}
        {step === 2 && <button type="button" className={buttonClass()} disabled={busy} onClick={submit}>{busy ? "Submitting…" : "Submit for compliance review"}</button>}
      </div>
    </div>
  );
}
