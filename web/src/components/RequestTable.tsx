import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { RequestSummary } from "@/lib/server/reports";
import { REQUEST_STATUS_LABEL } from "@/lib/requirements";
import { Empty, fmtAmount, fmtDay, StatusBadge } from "./ui";

export function RequestTable({ rows, empty = "No investment requests yet." }: { rows: (RequestSummary & { ticker?: string | null })[]; empty?: string }) {
  if (rows.length === 0) return <Empty>{empty}</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] text-[13px]">
        <thead>
          <tr className="border-b border-line text-left text-[12px] text-muted">
            <th className="py-2.5 pr-4 font-medium">ID</th>
            <th className="py-2.5 pr-4 font-medium">Product</th>
            <th className="py-2.5 pr-4 font-medium">Amount</th>
            <th className="py-2.5 pr-4 font-medium">Status</th>
            <th className="py-2.5 pr-4 font-medium">Date</th>
            <th className="w-6" />
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r.id} className="group">
              <td className="py-3 pr-4 font-semibold"><Link href={`/requests/${r.id}`} className="hover:text-primary">{r.reference}</Link></td>
              <td className="py-3 pr-4 text-body">{r.ticker ?? r.product_name}</td>
              <td className="py-3 pr-4 font-medium">{fmtAmount(r.amount, r.currency)}</td>
              <td className="py-3 pr-4"><StatusBadge status={r.status} label={REQUEST_STATUS_LABEL[r.status]} /></td>
              <td className="py-3 pr-4 text-muted">{fmtDay(r.created_at)}</td>
              <td className="py-3"><Link href={`/requests/${r.id}`} aria-label={`Open ${r.reference}`}><ChevronRight className="h-4 w-4 text-faint group-hover:text-primary" /></Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
