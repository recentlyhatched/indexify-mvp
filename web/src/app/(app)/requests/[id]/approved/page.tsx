import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CheckCircle2, ChevronLeft, ExternalLink, FileJson } from "lucide-react";
import { q1 } from "@/lib/server/db";
import { currentUser } from "@/lib/server/session";
import { lookupTx } from "@/lib/server/chain";
import { txLink } from "@/lib/config";
import { buttonClass, Card, cx, fmtAmount, fmtDate, Hash, TxHash } from "@/components/ui";

type Req = { id: string; reference: string; product_name: string; ticker: string | null; amount: string; currency: string; status: string };
type ApprovalRec = { public_record_id: string; canonical_payload: string; payload_hash: string; chain_status: string; tx_hash: string | null; created_at: Date };

/** Approved investment record: the final, anchored approval and its on-chain proof. */
export default async function ApprovedRecord({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user || user.role === "provider") notFound();
  const r = await q1<Req>(
    `select i.id, i.reference, i.amount, i.currency, i.status, p.name as product_name, p.ticker
       from investment_requests i join products p on p.id = i.product_id where i.id = $1 and i.institution_id = $2`,
    [id, user.institution_id],
  );
  if (!r) notFound();
  const rec = await q1<ApprovalRec>(`select * from approval_records where request_id = $1 order by version desc limit 1`, [id]);
  const verified = r.status === "blockchain_verified" && rec?.chain_status === "confirmed";
  if (!verified || !rec) redirect(`/requests/${id}`);
  const onChain = rec.tx_hash ? await lookupTx(rec.tx_hash) : null;
  const pub = await q1<{ anchored_at: Date | null }>(`select anchored_at from public_records where public_record_id = $1`, [rec.public_record_id]);

  return (
    <>
      <Link href={`/requests/${id}`} className="mb-4 inline-flex items-center gap-1 text-[13px] text-muted transition hover:text-ink">
        <ChevronLeft className="h-4 w-4" /> Approval workflow
      </Link>
      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-9 w-9 fill-success-500 text-white" />
            <h2 className="text-[20px] font-bold text-success">Investment Approved</h2>
          </div>
          <p className="mt-2 text-[13.5px] text-body">The investment has been approved by the committee and anchored on Stellar Testnet.</p>
          <dl className="mt-5 divide-y divide-line rounded-lg border border-line px-4 text-[13px]">
            {[
              ["Product", `${r.product_name}${r.ticker ? ` (${r.ticker})` : ""}`],
              ["Amount", fmtAmount(r.amount, r.currency)],
              ["Approval Date", fmtDate(rec.created_at)],
              ["Record ID", <Hash key="id" value={rec.public_record_id} chars={10} />],
              ["Record Hash", <span key="h"><Hash value={rec.payload_hash} chars={8} /> <span className="text-muted">(SHA-256)</span></span>],
              ["Stellar Transaction", rec.tx_hash ? <a key="tx" href={txLink(rec.tx_hash)} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1">View on Stellar Explorer <ExternalLink className="h-3.5 w-3.5" /></a> : "—"],
            ].map(([k, v]) => (
              <div key={k as string} className="grid grid-cols-[150px_1fr] gap-3 py-2.5">
                <dt className="text-muted">{k}</dt>
                <dd className="min-w-0 font-medium text-ink">{v}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <div className="space-y-5">
          <Card title="Approval Document">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-md bg-danger-50 text-danger"><FileJson className="h-5 w-5" /></span>
              <div className="min-w-0">
                <div className="truncate text-[13px] font-semibold">Final_Approval_{r.ticker ?? r.reference}.json</div>
                <div className="text-[11.5px] text-muted">Canonical JSON (pbc/1) · {(new TextEncoder().encode(rec.canonical_payload).length / 1024).toFixed(1)} KB</div>
              </div>
            </div>
            <a href={`/api/requests/${r.id}/record`} className={cx(buttonClass("secondary"), "mt-4 w-full")}>Download</a>
          </Card>
          <section className="overflow-hidden rounded-xl border border-success-500/30 bg-white">
            <div className="flex items-center gap-2 bg-success-50 px-5 py-3 text-[14px] font-semibold text-ink">
              <CheckCircle2 className="h-[18px] w-[18px] fill-success-500 text-white" /> On-Chain Record
            </div>
            <dl className="divide-y divide-line px-5 text-[13px]">
              <div className="flex justify-between gap-3 py-2.5"><dt className="text-muted">Status</dt><dd className="font-semibold text-success">Confirmed</dd></div>
              <div className="flex justify-between gap-3 py-2.5"><dt className="text-muted">Network</dt><dd className="font-medium">Stellar Testnet</dd></div>
              <div className="flex justify-between gap-3 py-2.5"><dt className="text-muted">Transaction Hash</dt><dd><TxHash hash={rec.tx_hash} /></dd></div>
              <div className="flex justify-between gap-3 py-2.5"><dt className="text-muted">Ledger</dt><dd className="font-medium">{onChain?.status === "confirmed" && onChain.ledger ? onChain.ledger.toLocaleString() : "Outside RPC retention"}</dd></div>
              <div className="flex justify-between gap-3 py-2.5"><dt className="text-muted">Timestamp</dt><dd className="font-medium">{onChain?.status === "confirmed" && onChain.closedAt ? fmtDate(onChain.closedAt) : fmtDate(pub?.anchored_at)}</dd></div>
              <div className="flex justify-between gap-3 py-2.5"><dt className="text-muted">Integrity</dt><dd><Link href={`/verify/${rec.public_record_id}`} className="link">Verify publicly →</Link></dd></div>
            </dl>
          </section>
        </div>
      </div>
    </>
  );
}
