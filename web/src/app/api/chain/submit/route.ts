import { z } from "zod";
import { requireUser } from "@/lib/server/session";
import { handle } from "@/lib/server/workflow";
import { submit } from "@/lib/server/anchoring";

const body = z.object({ chainTxId: z.string().uuid(), signedXdr: z.string().min(1), simulateTimeout: z.boolean().optional() });

export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const { chainTxId, signedXdr, simulateTimeout } = body.parse(await req.json());
  return submit(chainTxId, signedXdr, user, { simulateTimeout });
});
