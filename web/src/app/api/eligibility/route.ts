import { z } from "zod";
import { requireUser } from "@/lib/server/session";
import { handle, updateEligibilityItem } from "@/lib/server/workflow";

const body = z.object({
  productId: z.string(),
  code: z.string(),
  status: z.enum(["missing", "submitted", "reviewed", "exception"]),
  notes: z.string().max(1000).nullable(),
});

export const POST = handle(async (req: Request) => {
  const user = await requireUser("fund_manager", "compliance_reviewer");
  return { status: await updateEligibilityItem(user, body.parse(await req.json())) };
});
