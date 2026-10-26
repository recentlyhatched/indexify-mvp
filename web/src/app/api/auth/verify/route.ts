import { Keypair, TransactionBuilder, type Transaction } from "@stellar/stellar-sdk";
import { q1 } from "@/lib/server/db";
import { createSession, HttpError } from "@/lib/server/session";
import { audit } from "@/lib/server/db";
import { handle } from "@/lib/server/workflow";
import { NETWORK_PASSPHRASE } from "@/lib/config";

export const POST = handle(async (req: Request) => {
  const { signedXdr } = (await req.json()) as { signedXdr?: string };
  if (!signedXdr) throw new HttpError(400, "Missing signed challenge");
  let tx: Transaction;
  try {
    tx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE) as Transaction;
  } catch {
    throw new HttpError(400, "Malformed challenge");
  }
  const op = tx.operations[0];
  if (tx.operations.length !== 1 || op.type !== "manageData" || op.name !== "pensionbridge auth" || !op.value) {
    throw new HttpError(400, "Not a PensionBridge challenge");
  }
  if (tx.sequence !== "0") throw new HttpError(400, "Challenge must be non-submittable");
  const wallet = tx.source;
  const nonce = Buffer.from(op.value).toString("utf8");
  const used = await q1(
    `update auth_nonces set used_at = now() where nonce = $1 and wallet_address = $2 and used_at is null and expires_at > now() returning nonce`,
    [nonce, wallet],
  );
  if (!used) throw new HttpError(401, "Challenge expired or already used");
  const kp = Keypair.fromPublicKey(wallet);
  const hash = tx.hash();
  if (!tx.signatures.some((s) => kp.verify(hash, s.signature))) throw new HttpError(401, "Signature does not match wallet");

  await createSession(wallet);
  await audit(wallet, null, "auth.login", "wallet", wallet);
  const user = await q1(`select role, display_name from users where wallet_address = $1 and is_active`, [wallet]);
  return { wallet, authorized: !!user, user };
});
