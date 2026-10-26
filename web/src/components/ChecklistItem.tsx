"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/wallet";
import { buttonClass, cx, inputClass } from "./ui";

type Props = {
  productId: string;
  code: string;
  manualStatus: string;
  notes: string | null;
  role: string;
  hasDocument: boolean;
};

/** Updates an evidence item (FR-006). The server re-checks role permissions for every change. */
export function ChecklistItemEditor({ productId, code, manualStatus, notes, role, hasDocument }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState(manualStatus);
  const [text, setText] = useState(notes ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const options = [
    { v: "missing", l: "Missing" },
    { v: "submitted", l: "Submitted", disabled: !hasDocument },
    { v: "reviewed", l: "Reviewed", disabled: !hasDocument || role !== "compliance_reviewer" },
    { v: "exception", l: "Exception" },
  ];

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      await api("/api/eligibility", { productId, code, status, notes: text || null });
      router.refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg bg-paper p-3.5">
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o.v}
            type="button"
            disabled={o.disabled}
            onClick={() => setStatus(o.v)}
            title={o.v === "reviewed" && role !== "compliance_reviewer" ? "Only a compliance reviewer can mark evidence reviewed" : undefined}
            className={cx(
              "h-7 rounded-md border px-2.5 text-[12px] font-medium transition disabled:cursor-not-allowed disabled:opacity-40",
              status === o.v ? "border-primary bg-primary text-white" : "border-line bg-white text-body hover:border-primary/40",
            )}
          >
            {o.l}
          </button>
        ))}
      </div>
      <textarea
        className={cx(inputClass, "mt-2.5 text-[13px]")}
        rows={2}
        placeholder="Review notes"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="mt-2.5 flex items-center gap-3">
        <button className={buttonClass("primary", "sm")} disabled={busy || (status === manualStatus && text === (notes ?? ""))} onClick={save}>
          {busy ? "Saving…" : "Save"}
        </button>
        {err && <span className="text-xs text-danger">{err}</span>}
      </div>
    </div>
  );
}
