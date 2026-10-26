import { requireUser } from "@/lib/server/session";
import { handle } from "@/lib/server/workflow";
import { prepare } from "@/lib/server/anchoring";

export const POST = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser("provider", "compliance_reviewer");
  const { id } = await ctx.params;
  return { chain: await prepare("revoke_attestation", id, user) };
});
