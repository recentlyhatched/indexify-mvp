import "server-only";
import {
  Address,
  Contract,
  Keypair,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
  xdr,
  type Transaction,
} from "@stellar/stellar-sdk";
import { CONTRACT_ID, NETWORK_PASSPHRASE, RPC_URL } from "../config";

export const server = new rpc.Server(RPC_URL);

const CONTRACT_ERRORS: Record<number, string> = {
  1: "Contract already initialized",
  2: "Contract not initialized",
  3: "Wallet is not an authorized issuer for this attestation type on-chain",
  4: "Wallet is not an authorized approver on-chain",
  5: "A record with this ID already exists on-chain",
  6: "Record not found on-chain",
  7: "Only the original issuer can revoke this attestation",
  8: "Attestation already revoked",
  9: "Expiry must be in the future",
  10: "Invalid attestation type",
  11: "Superseded record does not exist on-chain",
};

export function explainChainError(raw: string): string {
  const m = /Error\(Contract, #(\d+)\)/.exec(raw);
  if (m && CONTRACT_ERRORS[Number(m[1])]) return CONTRACT_ERRORS[Number(m[1])];
  return raw.length > 300 ? raw.slice(0, 300) + "…" : raw;
}

export const sc = {
  bytes32: (hex: string) => {
    if (!/^[0-9a-f]{64}$/.test(hex)) throw new Error("expected 32-byte hex");
    return xdr.ScVal.scvBytes(Buffer.from(hex, "hex"));
  },
  address: (a: string) => new Address(a).toScVal(),
  u32: (n: number) => nativeToScVal(n, { type: "u32" }),
  u64: (n: bigint | number) => nativeToScVal(BigInt(n), { type: "u64" }),
  optBytes32: (hex: string | null) => (hex ? sc.bytes32(hex) : xdr.ScVal.scvVoid()),
  bool: (b: boolean) => xdr.ScVal.scvBool(b),
};

function contract() {
  if (!CONTRACT_ID) throw new Error("NEXT_PUBLIC_CONTRACT_ID is not configured");
  return new Contract(CONTRACT_ID);
}

/** Verifies we are on Testnet and the configured contract actually exists. */
export async function networkCheck() {
  const net = await server.getNetwork();
  if (net.passphrase !== NETWORK_PASSPHRASE) throw new Error("RPC is not Stellar Testnet");
  const key = xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: new Address(CONTRACT_ID).toScAddress(),
      key: xdr.ScVal.scvLedgerKeyContractInstance(),
      durability: xdr.ContractDataDurability.persistent,
    }),
  );
  const entries = await server.getLedgerEntries(key);
  if (!entries.entries.length) throw new Error("Configured contract not found on Testnet");
  const latest = await server.getLatestLedger();
  return { passphrase: net.passphrase, contractId: CONTRACT_ID, latestLedger: latest.sequence };
}

/** Read-only contract call via simulation. Throws on network failure so callers can report UNAVAILABLE. */
export async function readContract(method: string, args: xdr.ScVal[]): Promise<unknown> {
  const source = process.env.READ_SOURCE_ACCOUNT;
  if (!source) throw new Error("READ_SOURCE_ACCOUNT is not configured");
  const account = await server.getAccount(source);
  const tx = new TransactionBuilder(account, { fee: "100", networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(contract().call(method, ...args))
    .setTimeout(30)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(sim)) {
    const err = new Error(explainChainError(sim.error)) as Error & { contractError?: boolean };
    err.contractError = /Error\(Contract/.test(sim.error);
    throw err;
  }
  const retval = (sim as rpc.Api.SimulateTransactionSuccessResponse).result?.retval;
  return retval ? scValToNative(retval) : null;
}

export type OnChainRecord =
  | { kind: "attestation"; issuer: string; attestationKind: number; payloadHash: string; documentHash: string; issuedAt: number; expiresAt: number; revokedAt: number }
  | { kind: "approval"; anchoredBy: string; payloadHash: string; anchoredAt: number; supersedes: string | null };

const hex = (b: unknown) => (b ? Buffer.from(b as Uint8Array).toString("hex") : "");

export async function getOnChainRecord(id: string): Promise<OnChainRecord | null> {
  const raw = (await readContract("get_record", [sc.bytes32(id)])) as [string, Record<string, unknown>] | null;
  if (!raw) return null;
  const [variant, v] = raw;
  if (variant === "Attestation") {
    return {
      kind: "attestation",
      issuer: String(v.issuer),
      attestationKind: Number(v.kind),
      payloadHash: hex(v.payload_hash),
      documentHash: hex(v.document_hash),
      issuedAt: Number(v.issued_at),
      expiresAt: Number(v.expires_at),
      revokedAt: Number(v.revoked_at),
    };
  }
  return {
    kind: "approval",
    anchoredBy: String(v.anchored_by),
    payloadHash: hex(v.payload_hash),
    anchoredAt: Number(v.anchored_at),
    supersedes: v.supersedes ? hex(v.supersedes) : null,
  };
}

export async function getOnChainAttestationStatus(id: string) {
  const r = (await readContract("get_attestation_status", [sc.bytes32(id)])) as {
    status: string;
    expires_at: bigint;
    revoked_at: bigint;
  };
  return { status: String(r.status) as "active" | "revoked" | "expired", expiresAt: Number(r.expires_at), revokedAt: Number(r.revoked_at) };
}

/** Builds, simulates and assembles a contract call to be signed by `source` in Freighter. */
export async function prepareInvoke(source: string, method: string, args: xdr.ScVal[]) {
  const account = await server.getAccount(source).catch(() => {
    throw new Error("Wallet account not found on Testnet. Fund it with Friendbot first.");
  });
  const tx = new TransactionBuilder(account, { fee: "1000000", networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(contract().call(method, ...args))
    .setTimeout(300)
    .build();
  let prepared: Transaction;
  try {
    prepared = await server.prepareTransaction(tx);
  } catch (e) {
    throw new Error(explainChainError(e instanceof Error ? e.message : String(e)));
  }
  return { xdr: prepared.toXDR(), hash: Buffer.from(prepared.hash()).toString("hex") };
}

/**
 * Checks a Freighter-signed envelope is exactly the transaction we prepared and that
 * it carries a valid signature from the expected wallet.
 */
export function verifySignedEnvelope(signedXdr: string, expectedHash: string, wallet: string): Transaction {
  const tx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE) as Transaction;
  const hash = tx.hash();
  if (Buffer.from(hash).toString("hex") !== expectedHash) throw new Error("Signed transaction does not match the prepared transaction");
  const kp = Keypair.fromPublicKey(wallet);
  const ok = tx.signatures.some((s) => kp.verify(hash, s.signature));
  if (!ok) throw new Error("Transaction is not signed by the connected wallet");
  return tx;
}

export type TxOutcome = { status: "confirmed"; ledger?: number; closedAt?: string } | { status: "failed"; error: string } | { status: "unknown"; error?: string };

export async function sendSigned(tx: Transaction): Promise<TxOutcome & { submitted: boolean }> {
  try {
    const res = await server.sendTransaction(tx);
    if (res.status === "ERROR") {
      return { submitted: false, status: "failed", error: `Rejected by network: ${res.errorResult?.result.type ?? "error"}` };
    }
    if (res.status === "TRY_AGAIN_LATER") return { submitted: false, status: "failed", error: "Network busy, try again" };
    // PENDING or DUPLICATE: the transaction is in flight.
    return { submitted: true, status: "unknown" };
  } catch (e) {
    // We cannot know whether it reached the network; it must be reconciled before retrying.
    return { submitted: true, status: "unknown", error: e instanceof Error ? e.message : String(e) };
  }
}

export async function lookupTx(hash: string): Promise<TxOutcome> {
  try {
    const r = await server.getTransaction(hash);
    if (r.status === rpc.Api.GetTransactionStatus.SUCCESS) return { status: "confirmed", ledger: r.ledger, closedAt: new Date(r.createdAt * 1000).toISOString() };
    if (r.status === rpc.Api.GetTransactionStatus.FAILED) return { status: "failed", error: "Transaction failed on-chain" };
    return { status: "unknown" };
  } catch (e) {
    return { status: "unknown", error: e instanceof Error ? e.message : String(e) };
  }
}

export async function waitForTx(hash: string, timeoutMs = 25_000): Promise<TxOutcome> {
  const deadline = Date.now() + timeoutMs;
  let last: TxOutcome = { status: "unknown" };
  while (Date.now() < deadline) {
    last = await lookupTx(hash);
    if (last.status !== "unknown") return last;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return last;
}
