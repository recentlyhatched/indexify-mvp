import { q1 } from "@/lib/server/db";
import { HttpError, requireUser } from "@/lib/server/session";
import { handle } from "@/lib/server/workflow";
import { prepare } from "@/lib/server/anchoring";

export const POST = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser("committee_member");
  const { id } = await ctx.params;
  const rec = await q1<{ public_record_id: string }>(
    `select r.public_record_id from approval_records r join investment_requests i on i.id = r.request_id
      where r.request_id = $1 and i.institution_id = $2 and r.decision = 'approved' order by r.version desc limit 1`,
    [id, user.institution_id],
  );
  if (!rec) throw new HttpError(404, "No approved record to anchor");
  return { recordId: rec.public_record_id, chain: await prepare("register_approval", rec.public_record_id, user) };
});
