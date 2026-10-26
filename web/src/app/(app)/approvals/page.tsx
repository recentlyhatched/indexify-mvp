import Link from "next/link";
import { currentUser } from "@/lib/server/session";
import { requestSummaries } from "@/lib/server/reports";
import { REQUEST_STATUS_LABEL } from "@/lib/requirements";
import { buttonClass, cx, Empty, fmtAmount, fmtDay, Notice, PageHeader, StatusBadge } from "@/components/ui";

const ORDER = ["compliance_review", "committee_review", "approved", "anchoring_pending", "blockchain_verified"];
const QUEUE: Record<string, string[]> = { compliance_reviewer: ["compliance_review"], committee_member: ["committee_review", "approved", "anchoring_pending"] };

export default async function Approvals() {
  const user = await currentUser();
  if (!user || user.role === "provider") {
    return (
      <>
        <PageHeader title="Approvals" />
        <Notice tone="blue">Approvals are internal to the pension institution. Connect as the fund manager, compliance reviewer or committee member.</Notice>
      </>
    );
  }
  const rows = await requestSummaries(user.institution_id);
  const mine = QUEUE[user.role] ?? [];
  const sorted = [...rows].sort((a, b) => Number(mine.includes(b.status)) - Number(mine.includes(a.status)));

  return (
    <>
      <PageHeader title="Approvals">Track each request through compliance review, committee decision and on-chain anchoring.</PageHeader>
      {sorted.length === 0 ? (
        <Empty>No investment requests yet.</Empty>
      ) : (
        <ul className="space-y-3">
          {sorted.map((r) => {
            const idx = ORDER.indexOf(r.status);
            const rejected = r.status === "rejected";
            return (
              <li key={r.id} className="rounded-xl border border-line bg-white p-5 shadow-[0_1px_3px_rgba(23,20,44,0.04)]">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-bold text-ink">{r.reference}</span>
                      {mine.includes(r.status) && <span className="rounded-md bg-primary px-2 py-0.5 text-[11px] font-semibold text-white">Awaiting you</span>}
                    </div>
                    <div className="mt-1 text-[13.5px] font-semibold text-ink">{r.product_name}</div>
                    <div className="text-[12.5px] text-muted">{fmtAmount(r.amount, r.currency)} · Submitted {fmtDay(r.created_at)}</div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5" aria-label="Progress">
                      {ORDER.map((s, i) => (
                        <span key={s} className={cx("h-1.5 w-7 rounded-full", rejected && i >= 1 ? (i === 1 ? "bg-danger" : "bg-line") : i <= idx ? "bg-primary" : "bg-line")} />
                      ))}
                    </div>
                    <StatusBadge status={r.status} label={REQUEST_STATUS_LABEL[r.status]} />
                    <Link href={`/requests/${r.id}`} className={buttonClass("outline", "sm")}>View Details</Link>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
