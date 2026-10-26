import { z } from "zod";
import { requireUser } from "@/lib/server/session";
import { handle } from "@/lib/server/workflow";
import { reconcile } from "@/lib/server/anchoring";

const body = z.object({
  recordId: z.string().regex(/^[0-9a-f]{64}$/),
  operation: z.enum(["register_attestation", "revoke_attestation", "register_approval"]),
});

export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const { recordId, operation } = body.parse(await req.json());
  return { state: await reconcile(operation, recordId, user.wallet_address) };
});
