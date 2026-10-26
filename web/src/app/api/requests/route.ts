import { z } from "zod";
import { requireUser } from "@/lib/server/session";
import { createRequest, handle } from "@/lib/server/workflow";

const body = z.object({ productId: z.string(), amount: z.string(), currency: z.string(), rationale: z.string().max(2000).nullish() });

export const POST = handle(async (req: Request) => {
  const user = await requireUser("fund_manager");
  return { id: await createRequest(user, body.parse(await req.json())) };
});
