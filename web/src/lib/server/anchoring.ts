import "server-only";
import { audit, q, q1, tx } from "./db";
import {
  getOnChainAttestationStatus,
  getOnChainRecord,
  lookupTx,
  prepareInvoke,
  sc,
  sendSigned,
  verifySignedEnvelope,
  waitForTx,
} from "./chain";
import { NETWORK } from "../config";
import { HttpError, type SessionUser } from "./session";

/**
 * Blockchain write lifecycle shared by attestation registration, revocation and approval anchoring.
 *
 *   prepare → (Freighter signs) → submit → confirmed | failed | unknown
 *
 * A stable record ID is used for every attempt. Before a new attempt is prepared, previous attempts
 * and the contract's own state are reconciled, so an uncertain outcome never produces a duplicate
 * record and a failure is never displayed as success (FR-023).
 */

export type Operation = "register_attestation" | "revoke_attestation" | "register_approval";

type ChainTxRow = {
  id: string;
  record_id: string;
  operation_type: Operation;
  source_wallet: string;
  tx_hash: string;
  unsigned_xdr: string;
  status: "prepared" | "submitted" | "confirmed" | "failed" | "unknown" | "superseded";
  attempt_count: number;
  last_error: string | null;
  created_at: Date;
};

const TX_VALIDITY_MS = 300_000; // matches setTimeout(300) in prepareInvoke

type AttestationForChain = {
  id: string;
  public_record_id: string;
  attestation_type: string;
  payload_hash: string;
  document_hash: string;
  issuer_wallet: string;
  expires_at: Date | null;
  status: string;
};
type ApprovalForChain = {
  id: string;
  public_record_id: string;
  request_id: string;
  payload_hash: string;
  decision: string;
  chain_status: string;
  supersedes_public_id: string | null;
};

async function loadAttestation(publicId: string) {
  const a = await q1<AttestationForChain>(`select * from attestations where public_record_id = $1`, [publicId]);
  if (!a) throw new HttpError(404, "Attestation not found");
  return a;
}
async function loadApproval(publicId: string) {
  const a = await q1<ApprovalForChain>(
    `select r.*, s.public_record_id as supersedes_public_id from approval_records r
       left join approval_records s on s.id = r.supersedes_record_id where r.public_record_id = $1`,
    [publicId],
  );
  if (!a) throw new HttpError(404, "Approval record not found");
  return a;
}

/** Contract call arguments are always derived from stored state, never from the browser. */
async function buildCall(op: Operation, recordId: string, user: SessionUser) {
  if (op === "register_attestation") {
    const a = await loadAttestation(recordId);
    if (a.issuer_wallet !== user.wallet_address) throw new HttpError(403, "Only the issuing wallet can register this attestation");
    const expires = a.expires_at ? Math.floor(a.expires_at.getTime() / 1000) : 0;
    return {
      method: "register_attestation",
      args: [
        sc.address(user.wallet_address),
        sc.bytes32(a.public_record_id),
        sc.u32(a.attestation_type === "provider_declaration" ? 1 : 2),
        sc.bytes32(a.payload_hash),
        sc.bytes32(a.document_hash),
        sc.u64(expires),
      ],
    };
  }
  if (op === "revoke_attestation") {
    const a = await loadAttestation(recordId);
    if (a.issuer_wallet !== user.wallet_address) throw new HttpError(403, "Only the original issuer can revoke this attestation");
    if (a.status !== "active") throw new HttpError(409, "Only an active, anchored attestation can be revoked");
    return { method: "revoke_attestation", args: [sc.address(user.wallet_address), sc.bytes32(a.public_record_id)] };
  }
  const r = await loadApproval(recordId);
  if (user.role !== "committee_member") throw new HttpError(403, "Only an authorized committee member can anchor approvals");
  if (r.decision !== "approved") throw new HttpError(409, "Only approved records are anchored");
  return {
    method: "register_approval",
    args: [sc.address(user.wallet_address), sc.bytes32(r.public_record_id), sc.bytes32(r.payload_hash), sc.optBytes32(r.supersedes_public_id)],
  };
}

/** Checks the contract directly: has this operation already taken effect? */
async function alreadyOnChain(op: Operation, recordId: string): Promise<boolean> {
  if (op === "revoke_attestation") {
    const s = await getOnChainAttestationStatus(recordId).catch(() => null);
    return s?.status === "revoked";
  }
  const rec = await getOnChainRecord(recordId);
  if (!rec) return false;
  const expected = op === "register_attestation" ? (await loadAttestation(recordId)).payload_hash : (await loadApproval(recordId)).payload_hash;
  if (rec.payloadHash !== expected) {
    throw new HttpError(409, "A different record is already anchored under this ID; refusing to overwrite");
  }
  return true;
}

/** Applies the off-chain effects of a confirmed operation. Idempotent. */
async function applyConfirmed(op: Operation, recordId: string, txHash: string | null, actor: string) {
  await tx(async (c) => {
    if (op === "register_attestation") {
      await c.query(`update attestations set status = 'active', tx_hash = coalesce(tx_hash, $2) where public_record_id = $1 and status <> 'revoked'`, [
        recordId,
        txHash,
      ]);
      await c.query(
        `insert into public_records (public_record_id, record_type, network, tx_hash, anchored_at) values ($1,'attestation',$2,$3,now())
         on conflict (public_record_id) do update set tx_hash = coalesce(public_records.tx_hash, excluded.tx_hash), updated_at = now()`,
        [recordId, NETWORK, txHash],
      );
    } else if (op === "revoke_attestation") {
      await c.query(
        `update attestations set status = 'revoked', revoked_at = coalesce(revoked_at, now()), revoke_tx_hash = coalesce(revoke_tx_hash, $2) where public_record_id = $1`,
        [recordId, txHash],
      );
      await c.query(`update public_records set updated_at = now() where public_record_id = $1`, [recordId]);
    } else {
      const r = await c.query<{ request_id: string }>(
        `update approval_records set chain_status = 'confirmed', tx_hash = coalesce(tx_hash, $2) where public_record_id = $1 returning request_id`,
        [recordId, txHash],
      );
      await c.query(
        `insert into public_records (public_record_id, record_type, network, tx_hash, anchored_at) values ($1,'approval',$2,$3,now())
         on conflict (public_record_id) do update set tx_hash = coalesce(public_records.tx_hash, excluded.tx_hash), updated_at = now()`,
        [recordId, NETWORK, txHash],
      );
      if (r.rows[0]) {
        await c.query(`update investment_requests set status = 'anchoring_pending', updated_at = now() where id = $1`, [r.rows[0].request_id]);
      }
    }
    await audit(actor, null, `${op}.confirmed`, "chain_record", recordId, { txHash }, c);
  });

  if (op === "register_approval") {
    // "Blockchain verified" only once the anchored record is retrievable and its hash matches.
    const r = await loadApproval(recordId);
    const onChain = await getOnChainRecord(recordId).catch(() => null);
    if (onChain && onChain.payloadHash === r.payload_hash) {
      await q(`update investment_requests set status = 'blockchain_verified', updated_at = now() where id = $1`, [r.request_id]);
    }
  }
}

async function markPending(op: Operation, recordId: string, status: "pending" | "retry_required") {
  if (op === "register_attestation") {
    await q(`update attestations set status = $2 where public_record_id = $1 and status in ('anchoring_pending','retry_required')`, [
      recordId,
      status === "pending" ? "anchoring_pending" : "retry_required",
    ]);
  } else if (op === "register_approval") {
    const r = await q1<{ request_id: string }>(
      `update approval_records set chain_status = $2 where public_record_id = $1 and chain_status <> 'confirmed' returning request_id`,
      [recordId, status === "pending" ? "anchoring_pending" : "retry_required"],
    );
    if (r) await q(`update investment_requests set status = 'anchoring_pending', updated_at = now() where id = $1 and status = 'approved'`, [r.request_id]);
  }
}

/**
 * Reconciles every earlier attempt for a record + operation.
 * Returns "confirmed" if the operation has taken effect, "in_flight" if an attempt may still land,
 * or "clear" if it is safe to prepare a new attempt.
 */
export async function reconcile(op: Operation, recordId: string, actor: string): Promise<"confirmed" | "in_flight" | "clear"> {
  const attempts = await q<ChainTxRow>(
    `select * from chain_transactions where record_id = $1 and operation_type = $2 order by created_at`,
    [recordId, op],
  );
  if (attempts.some((t) => t.status === "confirmed")) return "confirmed";

  let inFlight = false;
  for (const t of attempts) {
    if (t.status === "submitted" || t.status === "unknown") {
      const out = await lookupTx(t.tx_hash);
      if (out.status === "confirmed") {
        await q(`update chain_transactions set status = 'confirmed', updated_at = now() where id = $1`, [t.id]);
        await applyConfirmed(op, recordId, t.tx_hash, actor);
        return "confirmed";
      }
      if (out.status === "failed") {
        await q(`update chain_transactions set status = 'failed', last_error = $2, updated_at = now() where id = $1`, [t.id, out.error]);
      } else if (Date.now() - t.created_at.getTime() > TX_VALIDITY_MS + 30_000) {
        // Past its time bounds the transaction can no longer be included.
        await q(`update chain_transactions set status = 'failed', last_error = 'Expired without confirmation', updated_at = now() where id = $1`, [t.id]);
      } else {
        inFlight = true;
      }
    }
  }

  // The contract is the source of truth: the operation may have landed through an attempt we lost track of.
  if (await alreadyOnChain(op, recordId)) {
    await applyConfirmed(op, recordId, null, actor);
    return "confirmed";
  }
  if (inFlight) return "in_flight";
  if (attempts.some((t) => t.status === "failed")) await markPending(op, recordId, "retry_required");
  return "clear";
}

export type PrepareResult =
  | { state: "confirmed" }
  | { state: "in_flight"; message: string }
  | { state: "ready"; chainTxId: string; xdr: string; txHash: string };

export async function prepare(op: Operation, recordId: string, user: SessionUser): Promise<PrepareResult> {
  const state = await reconcile(op, recordId, user.wallet_address);
  if (state === "confirmed") return { state };
  if (state === "in_flight") {
    return { state, message: "A previous transaction may still be confirming. Reconcile again in a few seconds before retrying." };
  }
  const call = await buildCall(op, recordId, user);
  const prepared = await prepareInvoke(user.wallet_address, call.method, call.args);
  const row = await tx(async (c) => {
    // Unsigned attempts that were never submitted can no longer be used.
    await c.query(`update chain_transactions set status = 'superseded', updated_at = now() where record_id = $1 and operation_type = $2 and status = 'prepared'`, [
      recordId,
      op,
    ]);
    const prev = await c.query<{ n: number }>(`select count(*)::int as n from chain_transactions where record_id = $1 and operation_type = $2`, [recordId, op]);
    const r = await c.query<{ id: string }>(
      `insert into chain_transactions (record_id, operation_type, network, source_wallet, tx_hash, unsigned_xdr, status, attempt_count)
       values ($1,$2,$3,$4,$5,$6,'prepared',$7) returning id`,
      [recordId, op, NETWORK, user.wallet_address, prepared.hash, prepared.xdr, prev.rows[0].n + 1],
    );
    return r.rows[0];
  });
  return { state: "ready", chainTxId: row.id, xdr: prepared.xdr, txHash: prepared.hash };
}

export type SubmitResult = { status: "confirmed" | "failed" | "unknown"; txHash: string; error?: string };

export async function submit(chainTxId: string, signedXdr: string, user: SessionUser, opts: { simulateTimeout?: boolean } = {}): Promise<SubmitResult> {
  const t = await q1<ChainTxRow>(`select * from chain_transactions where id = $1`, [chainTxId]);
  if (!t) throw new HttpError(404, "Transaction attempt not found");
  if (t.source_wallet !== user.wallet_address) throw new HttpError(403, "This transaction belongs to a different wallet");
  if (t.status !== "prepared") throw new HttpError(409, `This attempt is already ${t.status}; reconcile instead of resubmitting`);

  let signed;
  try {
    signed = verifySignedEnvelope(signedXdr, t.tx_hash, user.wallet_address);
  } catch (e) {
    throw new HttpError(400, e instanceof Error ? e.message : "Invalid signed transaction");
  }

  // Record the attempt as submitted *before* sending, so a crash or timeout is reconciled later.
  await q(`update chain_transactions set status = 'submitted', updated_at = now() where id = $1`, [t.id]);
  await markPending(t.operation_type, t.record_id, "pending");
  await audit(user.wallet_address, user.institution_id, `${t.operation_type}.submitted`, "chain_record", t.record_id, { txHash: t.tx_hash });

  const sent = await sendSigned(signed);
  if (sent.status === "failed") {
    await q(`update chain_transactions set status = 'failed', last_error = $2, updated_at = now() where id = $1`, [t.id, sent.error]);
    await markPending(t.operation_type, t.record_id, "retry_required");
    return { status: "failed", txHash: t.tx_hash, error: sent.error };
  }

  if (opts.simulateTimeout) {
    // Fault injection for the demo: behave as if the client timed out after submission.
    await q(`update chain_transactions set status = 'unknown', last_error = 'Simulated client timeout after submission', updated_at = now() where id = $1`, [t.id]);
    return { status: "unknown", txHash: t.tx_hash, error: "Simulated timeout: outcome unknown until reconciled" };
  }

  const out = await waitForTx(t.tx_hash);
  if (out.status === "confirmed") {
    await q(`update chain_transactions set status = 'confirmed', updated_at = now() where id = $1`, [t.id]);
    await applyConfirmed(t.operation_type, t.record_id, t.tx_hash, user.wallet_address);
    return { status: "confirmed", txHash: t.tx_hash };
  }
  if (out.status === "failed") {
    await q(`update chain_transactions set status = 'failed', last_error = $2, updated_at = now() where id = $1`, [t.id, out.error]);
    await markPending(t.operation_type, t.record_id, "retry_required");
    return { status: "failed", txHash: t.tx_hash, error: out.error };
  }
  await q(`update chain_transactions set status = 'unknown', last_error = $2, updated_at = now() where id = $1`, [t.id, out.error ?? "No confirmation yet"]);
  return { status: "unknown", txHash: t.tx_hash, error: "Confirmation not received yet; reconcile before retrying" };
}

export async function attemptsFor(recordId: string) {
  return q<Omit<ChainTxRow, "unsigned_xdr">>(
    `select id, record_id, operation_type, source_wallet, tx_hash, status, attempt_count, last_error, created_at
       from chain_transactions where record_id = $1 order by created_at`,
    [recordId],
  );
}
