import { z } from "zod";
import { requireUser } from "@/lib/server/session";
import { decide, handle } from "@/lib/server/workflow";

const body = z.object({ decision: z.enum(["approved", "rejected"]), rationale: z.string().max(1000).nullable() });

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser("committee_member");
  const { id } = await ctx.params;
  const { decision, rationale } = body.parse(await req.json());
  return decide(user, id, decision, rationale);
});
