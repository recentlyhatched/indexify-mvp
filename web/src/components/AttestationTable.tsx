import Link from "next/link";
import type { AttestationRow } from "@/lib/server/evidence";
import { ATTESTATION_TYPE_LABEL, REVIEW_SCOPES } from "@/lib/requirements";
import { Badge, Empty, fmtDay, Hash, StatusBadge, TxHash } from "./ui";

type Row = AttestationRow & { product_name: string; reliance: string };

export function AttestationTable({ rows }: { rows: Row[] }) {
  if (rows.length === 0) return <Empty>No attestations yet. Providers and reviewers issue them from a product page.</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-[13px]">
        <thead>
          <tr className="border-b border-line text-left text-[12px] text-muted">
            <th className="py-2.5 pr-4 font-medium">Type & scope</th>
            <th className="py-2.5 pr-4 font-medium">Product</th>
            <th className="py-2.5 pr-4 font-medium">Issuer</th>
            <th className="py-2.5 pr-4 font-medium">Issued / expires</th>
            <th className="py-2.5 pr-4 font-medium">Record · tx</th>
            <th className="py-2.5 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((a) => (
            <tr key={a.id} className="align-top">
              <td className="py-3 pr-4">
                <Badge tone={a.attestation_type === "provider_declaration" ? "primary" : "info"}>{ATTESTATION_TYPE_LABEL[a.attestation_type]}</Badge>
                <div className="mt-1 max-w-[220px] text-[12px] text-muted">{REVIEW_SCOPES[a.attestation_type][a.review_scope]}</div>
              </td>
              <td className="py-3 pr-4"><Link href={`/products/${a.product_id}?tab=attestations`} className="link">{a.product_name}</Link></td>
              <td className="py-3 pr-4 text-body">{a.issuer_institution_name}</td>
              <td className="py-3 pr-4 text-[12px]">{fmtDay(a.issued_at)}<br /><span className="text-muted">{a.expires_at ? fmtDay(a.expires_at) : "No expiry"}</span></td>
              <td className="py-3 pr-4 text-[12px]"><Hash value={a.public_record_id} href={`/verify/${a.public_record_id}`} chars={6} /><br /><TxHash hash={a.tx_hash} /></td>
              <td className="py-3">
                <StatusBadge status={a.status === "active" ? a.reliance : a.status} />
                {a.revoked_at && <div className="mt-1 text-[11px] text-muted">{fmtDay(a.revoked_at)}</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
