import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Check, CheckCircle2, FileText, Hourglass, X } from "lucide-react";
import { q, q1 } from "@/lib/server/db";
import { currentUser } from "@/lib/server/session";
import { evaluate } from "@/lib/server/evidence";
import { attemptsFor } from "@/lib/server/anchoring";
import { REQUEST_STATUS_LABEL } from "@/lib/requirements";
import { Badge, buttonClass, Card, cx, fmtAmount, fmtDate, fmtDay, Hash, PageHeader, shortWallet, StatusBadge, TxHash } from "@/components/ui";
import { AnchorApproval, ClearCompliance, CommitteeDecision } from "@/components/RequestActions";

type Req = {
  id: string;
  reference: string;
  institution_id: string;
  product_id: string;
  product_name: string;
  ticker: string | null;
  amount: string;
  currency: string;
  status: string;
  submitted_by: string;
  compliance_cleared_by: string | null;
  compliance_cleared_at: Date | null;
  compliance_notes: string | null;
  decision_rationale: string | null;
  rationale: string | null;
  relied_attestation_ids: string[];
  created_at: Date;
};
type ApprovalRec = { public_record_id: string; version: number; canonical_payload: string; payload_hash: string; decision: string; chain_status: string; tx_hash: string | null; created_at: Date };
type Attachment = { id: string; file_name: string; size_bytes: number; sha256_hash: string; created_at: Date };

const ORDER = ["draft", "compliance_review", "committee_review", "approved", "anchoring_pending", "blockchain_verified"];
type StepState = "done" | "active" | "pending" | "rejected" | "skipped";

function Step({ state, title, sub, children, last }: { state: StepState; title: string; sub: ReactNode; children?: ReactNode; last?: boolean }) {
  return (
    <li className="relative flex gap-4 pb-7 last:pb-0">
      {!last && <span aria-hidden className={cx("absolute top-9 bottom-1 left-[15px] w-px", state === "done" ? "bg-success-500/50" : "bg-line")} />}
      <span className="relative grid h-8 w-8 shrink-0 place-items-center">
        {state === "done" && <span className="grid h-8 w-8 place-items-center rounded-full bg-success-500 text-white"><Check className="h-4 w-4" strokeWidth={3} /></span>}
        {state === "active" && <span className="grid h-8 w-8 place-items-center rounded-full bg-primary text-white ring-4 ring-primary-100"><Hourglass className="h-3.5 w-3.5" /></span>}
        {state === "rejected" && <span className="grid h-8 w-8 place-items-center rounded-full bg-danger text-white"><X className="h-4 w-4" strokeWidth={3} /></span>}
        {(state === "pending" || state === "skipped") && <span className="h-5 w-5 rounded-md border-2 border-faint/70 bg-white" />}
      </span>
      <div className="min-w-0 flex-1 pt-1">
        <div className={cx("text-[14px] font-semibold", state === "pending" || state === "skipped" ? "text-body" : "text-ink")}>{title}</div>
        <div className="mt-0.5 text-[12.5px] text-muted">{sub}</div>
        {children && <div className="mt-3">{children}</div>}
      </div>
    </li>
  );
}

export default async function RequestDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user || user.role === "provider") notFound();
  const r = await q1<Req>(
    `select i.*, p.name as product_name, p.ticker from investment_requests i join products p on p.id = i.product_id where i.id = $1 and i.institution_id = $2`,
    [id, user.institution_id],
  );
  if (!r) notFound();
  const rec = await q1<ApprovalRec>(`select * from approval_records where request_id = $1 order by version desc limit 1`, [id]);
  const attempts = rec ? await attemptsFor(rec.public_record_id) : [];
  const attachments = await q<Attachment>(`select id, file_name, size_bytes, sha256_hash, created_at from request_attachments where request_id = $1 order by created_at`, [id]);
  const ev = await evaluate(user.institution_id, r.product_id);
  const events = await q<{ action: string; actor_wallet: string | null; occurred_at: Date }>(
    `select action, actor_wallet, occurred_at from audit_events
      where (entity_type = 'investment_request' and entity_id = $1) or (entity_type = 'chain_record' and entity_id = $2)
      order by occurred_at`,
    [id, rec?.public_record_id ?? ""],
  );
  const names = new Map((await q<{ wallet_address: string; display_name: string }>(`select wallet_address, display_name from users`)).map((u) => [u.wallet_address, u.display_name]));
  const who = (w: string | null) => (w && names.get(w)) || shortWallet(w);
  const decisionEvent = events.find((e) => e.action === "request.approved" || e.action === "request.rejected");

  const rejected = r.status === "rejected";
  const idx = ORDER.indexOf(r.status);
  const anchored = rec?.chain_status === "confirmed";
  const verified = r.status === "blockchain_verified" && anchored;

  const states: StepState[] = [
    "done",
    idx >= 2 || rejected ? "done" : "active",
    rejected ? "rejected" : idx >= 3 ? "done" : idx === 2 ? "active" : "pending",
    rejected ? "skipped" : anchored ? "done" : idx >= 3 ? "active" : "pending",
    rejected ? "skipped" : verified ? "done" : "pending",
  ];
  const summaryBadge = rejected ? <Badge tone="danger">Rejected</Badge> : verified ? <Badge tone="success">Approved</Badge> : <Badge tone="primary">In Progress</Badge>;

  return (
    <>
      <PageHeader title="Investment Approval Workflow" back={{ href: "/approvals", label: "All approvals" }}>
        Track the progress of your investment request. Internal approval and blockchain confirmation are tracked separately.
      </PageHeader>

      {verified && rec && (
        <Link href={`/requests/${r.id}/approved`} className="mb-5 flex items-center gap-3 rounded-xl border border-success-500/30 bg-success-50 px-5 py-4 transition hover:border-success-500/60">
          <CheckCircle2 className="h-7 w-7 shrink-0 fill-success-500 text-white" />
          <span className="flex-1">
            <span className="block text-[14.5px] font-bold text-success">Investment Approved</span>
            <span className="block text-[12.5px] text-body">Approved by the committee and anchored on Stellar Testnet.</span>
          </span>
          <span className="text-[13px] font-semibold text-primary">View approved record →</span>
        </Link>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <div className="space-y-5">
          <Card>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-[13px] font-bold text-ink">{r.reference}</div>
                <div className="mt-1 text-[14px] font-semibold">{r.product_name}{r.ticker && ` (${r.ticker})`}</div>
                <div className="text-[12.5px] text-muted">{fmtAmount(r.amount, r.currency)} · Submitted {fmtDay(r.created_at)}</div>
              </div>
              <div className="flex flex-col items-start gap-2 sm:items-end">
                {summaryBadge}
                <a href="#details" className={buttonClass("outline", "sm")}>View Details</a>
              </div>
            </div>

            <ol className="mt-6 border-t border-line pt-6">
              <Step state={states[0]} title="Investment Request Submitted" sub={<>By {who(r.submitted_by)} · {fmtDate(r.created_at)}</>} />
              <Step
                state={states[1]}
                title="Compliance Review"
                sub={states[1] === "done" ? <>Cleared by {who(r.compliance_cleared_by)} · {fmtDate(r.compliance_cleared_at)}</> : "Under review by the compliance team"}
              >
                {user.role === "compliance_reviewer" && r.status === "compliance_review" && (
                  <div className="rounded-lg border border-line bg-paper p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[13px] font-semibold">Evidence status</span>
                      <StatusBadge status={ev.status} />
                    </div>
                    {ev.exceptions.length > 0 && (
                      <ul className="mb-3 space-y-1 text-[12.5px] text-danger">
                        {ev.exceptions.map((e) => <li key={e.message}>• {e.message}</li>)}
                      </ul>
                    )}
                    <ClearCompliance requestId={r.id} />
                    <Link href={`/products/${r.product_id}?tab=eligibility`} className="link mt-3 inline-block text-[12.5px]">Open eligibility checker →</Link>
                  </div>
                )}
              </Step>
              <Step
                state={states[2]}
                title="Investment Committee Decision"
                sub={
                  states[2] === "done" ? <>Approved by {who(decisionEvent?.actor_wallet ?? null)} · {fmtDate(decisionEvent?.occurred_at)}</>
                  : states[2] === "rejected" ? <>Rejected by {who(decisionEvent?.actor_wallet ?? null)} · {fmtDate(decisionEvent?.occurred_at)}</>
                  : states[2] === "active" ? "Awaiting the investment committee. Evidence is re-validated at the moment of approval." : "Pending"
                }
              >
                {user.role === "committee_member" && r.status === "committee_review" && (
                  <div className="rounded-lg border border-line bg-paper p-4"><CommitteeDecision requestId={r.id} /></div>
                )}
              </Step>
              <Step
                state={states[3]}
                title="Blockchain Anchoring"
                sub={states[3] === "done" ? <>Anchored on Stellar Testnet · <TxHash hash={rec?.tx_hash} /></> : states[3] === "active" ? `Awaiting a signature from an authorized committee wallet${rec ? ` · ${rec.chain_status.replace(/_/g, " ")}` : ""}` : states[3] === "skipped" ? "Not applicable" : "Pending"}
              >
                {user.role === "committee_member" && rec?.decision === "approved" && !anchored && (
                  <div className="rounded-lg border border-line bg-paper p-4">
                    <AnchorApproval requestId={r.id} recordId={rec.public_record_id} wallet={user.wallet_address} hasAttempts={attempts.length > 0} />
                  </div>
                )}
              </Step>
              <Step last state={states[4]} title="Completed" sub={states[4] === "done" ? "Blockchain verified — anyone can check the record's integrity" : states[4] === "skipped" ? "Not applicable" : "Pending"} />
            </ol>
          </Card>

          {attempts.length > 0 && (
            <Card title="Blockchain transactions" subtitle="Every attempt under the same record ID — duplicates are impossible">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-[13px]">
                  <thead><tr className="border-b border-line text-left text-[12px] text-muted"><th className="py-2 font-medium">#</th><th className="py-2 font-medium">Transaction</th><th className="py-2 font-medium">Status</th><th className="py-2 font-medium">Note</th></tr></thead>
                  <tbody className="divide-y divide-line">
                    {attempts.map((a) => (
                      <tr key={a.id}>
                        <td className="py-2.5">{a.attempt_count}</td>
                        <td className="py-2.5"><TxHash hash={a.status === "prepared" || a.status === "superseded" ? null : a.tx_hash} /></td>
                        <td className="py-2.5"><StatusBadge status={a.status} /></td>
                        <td className="py-2.5 text-[12px] text-muted">{a.last_error ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {rec && !verified && (
            <Card title="Finalized record" subtitle={`Version ${rec.version} · frozen ${fmtDate(rec.created_at)} · canonical JSON (pbc/1), SHA-256`} right={rec.decision === "approved" ? <Badge tone="success">Approved</Badge> : <Badge tone="danger">Rejected</Badge>}>
              <dl className="divide-y divide-line text-[13px]">
                <div className="grid grid-cols-[130px_1fr] gap-3 py-2.5"><dt className="text-muted">Record ID</dt><dd><Hash value={rec.public_record_id} chars={12} /></dd></div>
                <div className="grid grid-cols-[130px_1fr] gap-3 py-2.5"><dt className="text-muted">Payload hash</dt><dd className="hash break-all">{rec.payload_hash}</dd></div>
                <div className="grid grid-cols-[130px_1fr] gap-3 py-2.5"><dt className="text-muted">Anchoring</dt><dd><StatusBadge status={rec.chain_status} /></dd></div>
              </dl>
              <a href={`/api/requests/${r.id}/record`} className={cx(buttonClass("secondary", "sm"), "mt-3")}>Download canonical record</a>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <div id="details" className="scroll-mt-6">
            <Card title="Request details">
              <dl className="divide-y divide-line text-[13px]">
                {[
                  ["Status", <StatusBadge key="s" status={r.status} label={REQUEST_STATUS_LABEL[r.status]} />],
                  ["Amount", fmtAmount(r.amount, r.currency)],
                  ["Rationale", r.rationale ?? "—"],
                  ["Compliance notes", r.compliance_notes ?? "—"],
                  ["Decision rationale", r.decision_rationale ?? "—"],
                ].map(([k, v]) => (
                  <div key={k as string} className="grid grid-cols-[120px_1fr] gap-3 py-2.5">
                    <dt className="text-muted">{k}</dt>
                    <dd className="min-w-0 break-words text-ink">{v}</dd>
                  </div>
                ))}
                <div className="py-2.5">
                  <dt className="mb-1.5 text-muted">Relied attestations</dt>
                  <dd className="space-y-1">{r.relied_attestation_ids.length ? r.relied_attestation_ids.map((a) => <div key={a}><Hash value={a} href={`/verify/${a}`} chars={8} /></div>) : "—"}</dd>
                </div>
              </dl>
            </Card>
          </div>

          <Card title="Supporting documents">
            {attachments.length === 0 ? (
              <p className="text-[13px] text-muted">None attached.</p>
            ) : (
              <ul className="space-y-2">
                {attachments.map((a) => (
                  <li key={a.id}>
                    <a href={`/api/requests/${r.id}/attachments/${a.id}`} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2.5 transition hover:border-primary/40">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-danger-50 text-danger"><FileText className="h-4 w-4" /></span>
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-medium">{a.file_name}</span>
                        <span className="block text-[11.5px] text-muted">{(a.size_bytes / 1024).toFixed(1)} KB · SHA-256 {a.sha256_hash.slice(0, 10)}…</span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Audit trail">
            <ol className="space-y-4 border-l border-line pl-4">
              {events.map((e, i) => (
                <li key={i} className="relative text-[13px]">
                  <span className="absolute top-1.5 -left-[21px] h-2.5 w-2.5 rounded-full border-2 border-white bg-primary" />
                  <div className="font-medium capitalize">{e.action.replace(/[._]/g, " ")}</div>
                  <div className="text-[12px] text-muted">{fmtDate(e.occurred_at)} · {who(e.actor_wallet)}</div>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}
