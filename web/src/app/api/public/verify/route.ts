import { NextResponse } from "next/server";
import { q1 } from "@/lib/server/db";
import { getOnChainAttestationStatus, getOnChainRecord, type OnChainRecord } from "@/lib/server/chain";
import { CONTRACT_ID, NETWORK } from "@/lib/config";

/**
 * Public verification (FR-024–026). Responds with an explicit allowlist of fields only.
 * The supplied hash is computed in the visitor's browser; record contents never leave it.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = (url.searchParams.get("id") ?? "").trim().toLowerCase();
  const hash = (url.searchParams.get("hash") ?? "").trim().toLowerCase() || null;
  const against = url.searchParams.get("against") === "document" ? "document" : "payload";
  const base = { recordId: id, network: NETWORK, contractId: CONTRACT_ID };

  if (!/^[0-9a-f]{64}$/.test(id) || (hash && !/^[0-9a-f]{64}$/.test(hash))) {
    return NextResponse.json({ ...base, result: "NOT_FOUND", message: "Record references are 64-character hex IDs" });
  }

  let rec: OnChainRecord | null;
  let attStatus: string | null = null;
  try {
    rec = await getOnChainRecord(id);
    if (rec?.kind === "attestation") attStatus = (await getOnChainAttestationStatus(id)).status;
  } catch {
    // A network failure must never be presented as a successful verification.
    return NextResponse.json({ ...base, result: "UNAVAILABLE", message: "Stellar Testnet could not be reached; integrity not established" });
  }
  if (!rec) return NextResponse.json({ ...base, result: "NOT_FOUND", message: "No record with this ID exists on-chain" });

  const pub = await q1<{ tx_hash: string | null }>(`select tx_hash from public_records where public_record_id = $1`, [id]).catch(() => null);
  const expected = rec.kind === "attestation" && against === "document" ? rec.documentHash : rec.payloadHash;
  const result = hash ? (hash === expected ? "MATCH" : "MISMATCH") : null;

  const iso = (s: number) => (s ? new Date(s * 1000).toISOString() : null);
  const metadata =
    rec.kind === "attestation"
      ? {
          recordType: rec.attestationKind === 1 ? "Provider declaration" : "Independent review attestation",
          status: attStatus,
          issuedAt: iso(rec.issuedAt),
          expiresAt: iso(rec.expiresAt),
          revokedAt: iso(rec.revokedAt),
          issuer: rec.issuer,
        }
      : { recordType: "Investment approval record", status: "anchored", anchoredAt: iso(rec.anchoredAt), supersedes: rec.supersedes };

  return NextResponse.json({
    ...base,
    result,
    comparedAgainst: hash ? (against === "document" ? "document_hash" : "payload_hash") : null,
    anchoredHash: rec.payloadHash,
    documentHash: rec.kind === "attestation" ? rec.documentHash : null,
    txHash: pub?.tx_hash ?? null,
    ...metadata,
  });
}
