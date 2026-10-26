import { z } from "zod";
import { requireUser } from "@/lib/server/session";
import { clearCompliance, handle } from "@/lib/server/workflow";

const body = z.object({ notes: z.string().max(1000).nullable() });

export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser("compliance_reviewer");
  const { id } = await ctx.params;
  await clearCompliance(user, id, body.parse(await req.json()).notes);
  return { ok: true };
});
