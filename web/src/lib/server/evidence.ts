import "server-only";
import { q, q1 } from "./db";
import { getOnChainAttestationStatus } from "./chain";
import { REQUIREMENTS, type Requirement } from "../requirements";

export type DocumentRow = {
  id: string;
  product_id: string;
  document_type: string;
  version: number;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  sha256_hash: string;
  uploaded_by: string;
  created_at: Date;
};

export type AttestationRow = {
  id: string;
  public_record_id: string;
  product_id: string;
  document_id: string;
  document_hash: string;
  attestation_type: "provider_declaration" | "independent_review";
  review_scope: string;
  claim: string;
  issuer_wallet: string;
  issuer_institution_id: string;
  issuer_institution_name?: string;
  issued_at: Date;
  expires_at: Date | null;
  status: "anchoring_pending" | "retry_required" | "active" | "revoked";
  payload_hash: string;
  tx_hash: string | null;
  revoked_at: Date | null;
  revoke_tx_hash: string | null;
};

/** Status of an attestation for *new reliance* — distinct from its historical record. */
export function relianceStatus(a: Pick<AttestationRow, "status" | "expires_at">, now = new Date()) {
  if (a.status === "revoked") return "revoked" as const;
  if (a.status !== "active") return "not_anchored" as const;
  if (a.expires_at && a.expires_at.getTime() <= now.getTime()) return "expired" as const;
  return "active" as const;
}

export async function latestDocuments(productId: string): Promise<Record<string, DocumentRow>> {
  const rows = await q<DocumentRow>(
    `select distinct on (document_type) * from documents where product_id = $1 order by document_type, version desc`,
    [productId],
  );
  return Object.fromEntries(rows.map((d) => [d.document_type, d]));
}

export async function productAttestations(productId: string): Promise<AttestationRow[]> {
  return q<AttestationRow>(
    `select a.*, i.name as issuer_institution_name from attestations a
       join institutions i on i.id = a.issuer_institution_id
      where a.product_id = $1 order by a.issued_at desc`,
    [productId],
  );
}

export type ItemEvaluation = {
  requirement: Requirement;
  manualStatus: "missing" | "submitted" | "reviewed" | "exception";
  effectiveStatus: "missing" | "submitted" | "reviewed" | "exception";
  notes: string | null;
  document: DocumentRow | null;
  attestation: AttestationRow | null;
  exceptions: string[];
};

export type Evaluation = {
  reviewId: string | null;
  status: "evidence_complete" | "needs_legal_review" | "not_cleared";
  items: ItemEvaluation[];
  exceptions: { code: string; message: string }[];
  reliedAttestations: AttestationRow[];
};

/**
 * Evaluates the checklist for an institution and product (FR-007, FR-009, FR-014, FR-016).
 * With `confirmOnChain`, revocation is re-checked against the authoritative contract state,
 * and an unreachable network blocks progression rather than passing silently.
 */
export async function evaluate(institutionId: string, productId: string, opts: { confirmOnChain?: boolean } = {}): Promise<Evaluation> {
  const review = await q1<{ id: string }>(`select id from eligibility_reviews where institution_id = $1 and product_id = $2`, [
    institutionId,
    productId,
  ]);
  const itemRows = review
    ? await q<{ requirement_code: string; status: ItemEvaluation["manualStatus"]; review_notes: string | null; evidence_document_id: string | null }>(
        `select requirement_code, status, review_notes, evidence_document_id from eligibility_items where review_id = $1`,
        [review.id],
      )
    : [];
  const docs = await latestDocuments(productId);
  const atts = await productAttestations(productId);
  const trusted = await q<{ issuer_wallet: string; attestation_type: string }>(
    `select issuer_wallet, attestation_type from trusted_issuers where institution_id = $1`,
    [institutionId],
  );
  const isTrusted = (a: AttestationRow) => trusted.some((t) => t.issuer_wallet === a.issuer_wallet && t.attestation_type === a.attestation_type);

  const chainStatusCache = new Map<string, string>();
  const items: ItemEvaluation[] = [];
  const relied: AttestationRow[] = [];

  for (const req of REQUIREMENTS) {
    const row = itemRows.find((r) => r.requirement_code === req.code);
    const manualStatus = row?.status ?? "missing";
    const doc = docs[req.documentType] ?? null;
    const exceptions: string[] = [];
    let attestation: AttestationRow | null = null;

    if (!doc) exceptions.push(`No ${req.documentType.replace("_", " ")} on file`);
    else if (row?.evidence_document_id && row.evidence_document_id !== doc.id && manualStatus === "reviewed") {
      exceptions.push(`Reviewed against an older document version; v${doc.version} must be re-reviewed`);
    }

    if (doc && req.attestation) {
      const candidates = atts.filter((a) => a.attestation_type === req.attestation!.type && req.attestation!.scopes.includes(a.review_scope));
      const usable = candidates.filter((a) => relianceStatus(a) === "active" && a.document_hash === doc.sha256_hash && isTrusted(a));
      attestation = usable[0] ?? null;

      if (attestation && opts.confirmOnChain) {
        let chain = chainStatusCache.get(attestation.public_record_id);
        if (!chain) {
          try {
            chain = (await getOnChainAttestationStatus(attestation.public_record_id)).status;
          } catch {
            chain = "unavailable";
          }
          chainStatusCache.set(attestation.public_record_id, chain);
        }
        if (chain !== "active") {
          exceptions.push(
            chain === "unavailable"
              ? "Could not confirm attestation status on Stellar; progression blocked until the network is reachable"
              : `Attestation is ${chain} on-chain`,
          );
          attestation = null;
        }
      }

      if (!attestation && !exceptions.length) {
        const label = req.attestation.type === "provider_declaration" ? "provider declaration" : "independent review attestation";
        if (!candidates.length) exceptions.push(`Missing ${label}`);
        else {
          const reasons = new Set<string>();
          for (const a of candidates) {
            const s = relianceStatus(a);
            if (s === "revoked") reasons.add(`${label} revoked`);
            else if (s === "expired") reasons.add(`${label} expired`);
            else if (s === "not_anchored") reasons.add(`${label} not yet confirmed on-chain`);
            else if (a.document_hash !== doc.sha256_hash) reasons.add(`${label} covers a different document version (hash mismatch)`);
            else if (!isTrusted(a)) reasons.add(`${label} issuer is not trusted by this institution`);
          }
          exceptions.push(...reasons);
        }
      }
      if (attestation && !relied.some((r) => r.id === attestation!.id)) relied.push(attestation);
    }

    const effectiveStatus = !doc ? "missing" : exceptions.length ? "exception" : manualStatus === "missing" ? "submitted" : manualStatus;
    items.push({ requirement: req, manualStatus, effectiveStatus, notes: row?.review_notes ?? null, document: doc, attestation, exceptions });
  }

  const status: Evaluation["status"] = items.some((i) => i.effectiveStatus === "missing" || i.effectiveStatus === "exception")
    ? "not_cleared"
    : items.every((i) => i.effectiveStatus === "reviewed")
      ? "evidence_complete"
      : "needs_legal_review";

  return {
    reviewId: review?.id ?? null,
    status,
    items,
    exceptions: items.flatMap((i) => i.exceptions.map((m) => ({ code: i.requirement.code, message: `${i.requirement.title}: ${m}` }))),
    reliedAttestations: relied,
  };
}
