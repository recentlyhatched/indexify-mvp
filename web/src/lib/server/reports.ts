import "server-only";
import { q } from "./db";
import { evaluate, relianceStatus, type AttestationRow } from "./evidence";

export type RequestSummary = {
  id: string;
  reference: string;
  product_id: string;
  product_name: string;
  amount: string;
  currency: string;
  status: string;
  submitted_by: string;
  compliance_cleared_by: string | null;
  created_at: Date;
  updated_at: Date;
  decision: string | null;
  public_record_id: string | null;
  payload_hash: string | null;
  tx_hash: string | null;
  chain_status: string | null;
};

export async function requestSummaries(institutionId: string) {
  return q<RequestSummary>(
    `select i.id, i.reference, i.product_id, p.name as product_name, i.amount, i.currency, i.status, i.submitted_by,
            i.compliance_cleared_by, i.created_at, i.updated_at,
            r.decision, r.public_record_id, r.payload_hash, r.tx_hash, r.chain_status
       from investment_requests i
       join products p on p.id = i.product_id
       left join lateral (select * from approval_records ar where ar.request_id = i.id order by ar.version desc limit 1) r on true
      where i.institution_id = $1
      order by i.created_at desc`,
    [institutionId],
  );
}

export async function allAttestations() {
  const rows = await q<AttestationRow & { product_name: string }>(
    `select a.*, i.name as issuer_institution_name, p.name as product_name
       from attestations a join institutions i on i.id = a.issuer_institution_id join products p on p.id = a.product_id
      order by a.issued_at desc`,
  );
  return rows.map((a) => ({ ...a, reliance: relianceStatus(a) }));
}

export type ExceptionRow = { kind: "missing_evidence" | "expired_attestation" | "revoked_attestation" | "failed_anchoring" | "pending_anchoring"; subject: string; message: string; href: string };

/** Compliance exceptions for the dashboard (FR-029). */
export async function complianceExceptions(institutionId: string): Promise<ExceptionRow[]> {
  const out: ExceptionRow[] = [];
  const products = await q<{ id: string; name: string }>(`select id, name from products where not is_illustrative order by name`);
  for (const p of products) {
    const ev = await evaluate(institutionId, p.id);
    for (const item of ev.items) {
      for (const m of item.exceptions) {
        const kind = /revoked/.test(m) ? "revoked_attestation" : /expired/.test(m) ? "expired_attestation" : "missing_evidence";
        out.push({ kind, subject: p.name, message: `${item.requirement.title}: ${m}`, href: `/eligibility/${p.id}` });
      }
    }
  }
  const atts = await allAttestations();
  for (const a of atts) {
    if (a.status === "retry_required") {
      out.push({ kind: "failed_anchoring", subject: a.product_name, message: `Attestation ${a.public_record_id.slice(0, 10)}… failed to anchor; retry required`, href: `/products/${a.product_id}` });
    } else if (a.status === "anchoring_pending") {
      out.push({ kind: "pending_anchoring", subject: a.product_name, message: `Attestation ${a.public_record_id.slice(0, 10)}… awaiting on-chain confirmation`, href: `/products/${a.product_id}` });
    }
  }
  for (const r of await requestSummaries(institutionId)) {
    if (r.chain_status === "retry_required") {
      out.push({ kind: "failed_anchoring", subject: r.reference, message: "Approval anchoring failed; retry required", href: `/requests/${r.id}` });
    } else if (r.status === "anchoring_pending") {
      out.push({ kind: "pending_anchoring", subject: r.reference, message: "Approval awaiting blockchain confirmation", href: `/requests/${r.id}` });
    }
  }
  return out;
}
