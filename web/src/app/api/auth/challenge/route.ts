import { randomBytes } from "node:crypto";
import { Account, Operation, StrKey, TransactionBuilder } from "@stellar/stellar-sdk";
import { q } from "@/lib/server/db";
import { HttpError } from "@/lib/server/session";
import { handle } from "@/lib/server/workflow";
import { NETWORK_PASSPHRASE } from "@/lib/config";

/**
 * Issues a login challenge: a never-submittable transaction (sequence 0, 5-minute time bounds)
 * carrying a one-time nonce. Signing it in Freighter proves control of the wallet.
 */
export const POST = handle(async (req: Request) => {
  const { address } = (await req.json()) as { address?: string };
  if (!address || !StrKey.isValidEd25519PublicKey(address)) throw new HttpError(400, "Invalid Stellar address");
  const nonce = randomBytes(24).toString("base64url");
  await q(`insert into auth_nonces (nonce, wallet_address, expires_at) values ($1,$2, now() + interval '5 minutes')`, [nonce, address]);
  const tx = new TransactionBuilder(new Account(address, "-1"), { fee: "100", networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(Operation.manageData({ name: "pensionbridge auth", value: nonce }))
    .setTimeout(300)
    .build();
  return { xdr: tx.toXDR() };
});
