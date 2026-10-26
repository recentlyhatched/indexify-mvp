import "server-only";
import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { audit, q, q1, tx } from "./db";
import { HttpError, type SessionUser } from "./session";
import { evaluate, latestDocuments } from "./evidence";
import {
  approvalPayloadSchema,
  attestationPayloadSchema,
  hashCanonical,
  isoNow,
  normalizeAmount,
  CANONICALIZATION_VERSION,
} from "../canonical";
import { REQUIREMENTS, REVIEW_SCOPES, type AttestationType } from "../requirements";

export const newRecordId = () => randomBytes(32).toString("hex");

export function handle<A extends unknown[]>(fn: (...args: A) => Promise<unknown>) {
  return async (...args: A) => {
    try {
      const out = await fn(...args);
      return out instanceof Response ? out : NextResponse.json(out ?? { ok: true });
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
      if (e instanceof ZodError) return NextResponse.json({ error: e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400 });
      console.error(e);
      return NextResponse.json({ error: e instanceof Error ? e.message : "Unexpected error" }, { status: 500 });
    }
  };
}

// ---- Documents ---------------------------------------------------------------

export async function assertProviderOwnsProduct(user: SessionUser, productId: string) {
  const p = await q1<{ provider_institution_id: string | null }>(`select provider_institution_id from products where id = $1`, [productId]);
  if (!p) throw new HttpError(404, "Product not found");
  if (p.provider_institution_id !== user.institution_id) throw new HttpError(403, "Providers can only act on their own products");
}

export async function canReadDocument(user: SessionUser, productId: string) {
  if (user.role !== "provider") return true;
  const p = await q1<{ provider_institution_id: string }>(`select provider_institution_id from products where id = $1`, [productId]);
  return p?.provider_institution_id === user.institution_id;
}

// ---- Attestations --------------------------------------------------------------

export async function createAttestation(
  user: SessionUser,
  input: { productId: string; documentId: string; type: AttestationType; scope: string; claim: string; expiresInMinutes: number | null },
) {
  if (input.type === "provider_declaration" && user.role !== "provider") throw new HttpError(403, "Only providers issue provider declarations");
  if (input.type === "independent_review" && user.role !== "compliance_reviewer") {
    throw new HttpError(403, "Only compliance reviewers issue independent review attestations");
  }
  if (input.type === "provider_declaration") await assertProviderOwnsProduct(user, input.productId);
  if (!REVIEW_SCOPES[input.type][input.scope]) throw new HttpError(400, "Unknown review scope for this attestation type");

  const doc = await q1<{ id: string; document_type: string; version: number; sha256_hash: string }>(
    `select id, document_type, version, sha256_hash from documents where id = $1 and product_id = $2`,
    [input.documentId, input.productId],
  );
  if (!doc) throw new HttpError(404, "Document not found for this product");

  // Whole seconds so the stored expiry equals the on-chain u64 exactly.
  const now = new Date(Math.floor(Date.now() / 1000) * 1000);
  const expires = input.expiresInMinutes ? new Date(now.getTime() + input.expiresInMinutes * 60_000) : null;
  const recordId = newRecordId();
  const payload = attestationPayloadSchema.parse({
    schema: "pensionbridge.attestation/1",
    canonicalization: CANONICALIZATION_VERSION,
    record_id: recordId,
    attestation_type: input.type,
    product_id: input.productId,
    document: { document_type: doc.document_type, version: doc.version, sha256: doc.sha256_hash },
    review_scope: input.scope,
    claim: input.claim.trim(),
    issuer_wallet: user.wallet_address,
    issued_at: isoNow(now),
    expires_at: expires ? isoNow(expires) : null,
  });
  const { canonical, hash } = await hashCanonical(payload);
  await q(
    `insert into attestations (public_record_id, product_id, document_id, document_hash, attestation_type, review_scope, claim,
       issuer_wallet, issuer_institution_id, issued_at, expires_at, status, canonical_payload, payload_hash)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'anchoring_pending',$12,$13)`,
    [recordId, input.productId, doc.id, doc.sha256_hash, input.type, input.scope, payload.claim, user.wallet_address, user.institution_id, now, expires, canonical, hash],
  );
  await audit(user.wallet_address, user.institution_id, "attestation.created", "attestation", recordId, { type: input.type, scope: input.scope, payloadHash: hash });
  return recordId;
}

// ---- Eligibility ---------------------------------------------------------------

export async function ensureReview(institutionId: string, productId: string) {
  const r = await q1<{ id: string }>(
    `insert into eligibility_reviews (institution_id, product_id) values ($1,$2)
     on conflict (institution_id, product_id) do update set updated_at = eligibility_reviews.updated_at returning id`,
    [institutionId, productId],
  );
  return r!.id;
}

export async function updateEligibilityItem(
  user: SessionUser,
  input: { productId: string; code: string; status: "missing" | "submitted" | "reviewed" | "exception"; notes: string | null },
) {
  const req = REQUIREMENTS.find((r) => r.code === input.code);
  if (!req) throw new HttpError(400, "Unknown requirement");
  if (input.status === "reviewed" && user.role !== "compliance_reviewer") {
    throw new HttpError(403, "Only a compliance reviewer can mark evidence as reviewed");
  }
  const docs = await latestDocuments(input.productId);
  const doc = docs[req.documentType];
  if ((input.status === "submitted" || input.status === "reviewed") && !doc) throw new HttpError(409, "No supporting document on file for this requirement");

  const reviewId = await ensureReview(user.institution_id, input.productId);
  await q(
    `insert into eligibility_items (review_id, requirement_code, status, evidence_document_id, review_notes, updated_by, updated_at)
     values ($1,$2,$3,$4,$5,$6,now())
     on conflict (review_id, requirement_code) do update set status = excluded.status, evidence_document_id = excluded.evidence_document_id,
       review_notes = excluded.review_notes, updated_by = excluded.updated_by, updated_at = now()`,
    [reviewId, input.code, input.status, doc?.id ?? null, input.notes, user.wallet_address],
  );
  const ev = await evaluate(user.institution_id, input.productId);
  await q(`update eligibility_reviews set status = $2, reviewer_id = $3, updated_at = now() where id = $1`, [reviewId, ev.status, user.id]);
  await audit(user.wallet_address, user.institution_id, "eligibility.item_updated", "eligibility_item", `${input.productId}:${input.code}`, {
    status: input.status,
    documentId: doc?.id,
  });
  return ev.status;
}

// ---- Investment requests -------------------------------------------------------

type RequestRow = {
  id: string;
  reference: string;
  institution_id: string;
  product_id: string;
  amount: string;
  currency: string;
  status: string;
  submitted_by: string;
  compliance_cleared_by: string | null;
  compliance_cleared_at: Date | null;
  relied_attestation_ids: string[];
};

export async function loadRequest(user: SessionUser, id: string) {
  const r = await q1<RequestRow>(`select * from investment_requests where id = $1`, [id]);
  if (!r || r.institution_id !== user.institution_id) throw new HttpError(404, "Request not found");
  return r;
}

export async function createRequest(user: SessionUser, input: { productId: string; amount: string; currency: string; rationale?: string | null }) {
  const product = await q1<{ id: string; is_illustrative: boolean }>(`select id, is_illustrative from products where id = $1`, [input.productId]);
  if (!product) throw new HttpError(404, "Product not found");
  let amount: string;
  try {
    amount = normalizeAmount(input.amount);
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
  if (!/^[A-Z]{3}$/.test(input.currency)) throw new HttpError(400, "Currency must be a 3-letter ISO code");
  const count = await q1<{ n: number }>(`select count(*)::int as n from investment_requests`);
  const reference = `IR-${new Date().getUTCFullYear()}-${String((count?.n ?? 0) + 1).padStart(4, "0")}`;
  const row = await q1<{ id: string }>(
    `insert into investment_requests (reference, institution_id, product_id, amount, currency, status, submitted_by, rationale)
     values ($1,$2,$3,$4,$5,'compliance_review',$6,$7) returning id`,
    [reference, user.institution_id, input.productId, amount, input.currency, user.wallet_address, input.rationale?.trim() || null],
  );
  await audit(user.wallet_address, user.institution_id, "request.submitted", "investment_request", row!.id, { reference, amount, currency: input.currency });
  return row!.id;
}

export async function clearCompliance(user: SessionUser, id: string, notes: string | null) {
  const r = await loadRequest(user, id);
  if (r.status !== "compliance_review") throw new HttpError(409, `Request is in ${r.status}; compliance clearance not possible`);
  const ev = await evaluate(user.institution_id, r.product_id, { confirmOnChain: true });
  if (ev.status !== "evidence_complete") {
    throw new HttpError(409, `Evidence is not complete (${ev.status.replace(/_/g, " ")}). ${ev.exceptions.map((e) => e.message).join(" · ") || "Review every checklist item first."}`);
  }
  await tx(async (c) => {
    await c.query(
      `update investment_requests set status = 'committee_review', compliance_cleared_by = $2, compliance_cleared_at = now(),
         compliance_notes = $3, relied_attestation_ids = $4, updated_at = now() where id = $1 and status = 'compliance_review'`,
      [id, user.wallet_address, notes, JSON.stringify(ev.reliedAttestations.map((a) => a.public_record_id))],
    );
    await audit(user.wallet_address, user.institution_id, "request.compliance_cleared", "investment_request", id, {
      reliedAttestations: ev.reliedAttestations.map((a) => a.public_record_id),
    }, c);
  });
}

export async function decide(user: SessionUser, id: string, decision: "approved" | "rejected", rationale: string | null) {
  const r = await loadRequest(user, id);
  if (r.status !== "committee_review") throw new HttpError(409, "The committee can only decide after compliance clearance");

  // Evidence is re-evaluated at the moment of decision: a revocation since clearance blocks approval (FR-009).
  const ev = await evaluate(user.institution_id, r.product_id, { confirmOnChain: decision === "approved" });
  if (decision === "approved") {
    if (ev.status !== "evidence_complete") {
      throw new HttpError(409, `Approval blocked: ${ev.exceptions.map((e) => e.message).join(" · ") || "evidence no longer complete"}`);
    }
    const stillRelied = new Set(ev.reliedAttestations.map((a) => a.public_record_id));
    if (!r.relied_attestation_ids.every((a) => stillRelied.has(a))) {
      throw new HttpError(409, "Approval blocked: attestations relied on at compliance clearance are no longer valid. Return the request to compliance.");
    }
  }

  const docs = await latestDocuments(r.product_id);
  const decidedAt = new Date();
  const recordId = newRecordId();
  const payload = approvalPayloadSchema.parse({
    schema: "pensionbridge.approval/1",
    canonicalization: CANONICALIZATION_VERSION,
    record_id: recordId,
    record_version: 1,
    scheme_id: r.institution_id,
    request_reference: r.reference,
    product: {
      id: r.product_id,
      documentation: Object.values(docs)
        .sort((a, b) => a.document_type.localeCompare(b.document_type))
        .map((d) => ({ document_type: d.document_type, version: d.version, sha256: d.sha256_hash })),
    },
    amount: { value: r.amount, currency: r.currency },
    approvers: [
      { wallet: r.compliance_cleared_by!, role: "compliance_reviewer", decision: "cleared", decided_at: isoNow(r.compliance_cleared_at!) },
      { wallet: user.wallet_address, role: "committee_member", decision, decided_at: isoNow(decidedAt) },
    ],
    decision,
    decision_at: isoNow(decidedAt),
    attestations: ev.reliedAttestations
      .filter((a) => r.relied_attestation_ids.includes(a.public_record_id))
      .map((a) => ({ public_record_id: a.public_record_id, attestation_type: a.attestation_type, payload_hash: a.payload_hash })),
    supersedes_record_id: null,
  });
  const { canonical, hash } = await hashCanonical(payload);

  await tx(async (c) => {
    const upd = await c.query(
      `update investment_requests set status = $2, decision_rationale = $3, updated_at = now() where id = $1 and status = 'committee_review'`,
      [id, decision, rationale],
    );
    if (upd.rowCount !== 1) throw new HttpError(409, "Request changed concurrently; reload and try again");
    await c.query(
      `insert into approval_records (public_record_id, request_id, version, canonical_payload, payload_hash, decision, approvers)
       values ($1,$2,1,$3,$4,$5,$6)`,
      [recordId, id, canonical, hash, decision, JSON.stringify(payload.approvers)],
    );
    await audit(user.wallet_address, user.institution_id, `request.${decision}`, "investment_request", id, { recordId, payloadHash: hash, rationale }, c);
  });
  return { recordId, payloadHash: hash };
}
