import { q1 } from "@/lib/server/db";
import { HttpError, requireUser } from "@/lib/server/session";
import { handle } from "@/lib/server/workflow";

/** Download the exact canonical bytes of the finalized record (institution users only). */
export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser("fund_manager", "compliance_reviewer", "committee_member");
  const { id } = await ctx.params;
  const rec = await q1<{ canonical_payload: string; reference: string; version: number }>(
    `select r.canonical_payload, i.reference, r.version from approval_records r join investment_requests i on i.id = r.request_id
      where r.request_id = $1 and i.institution_id = $2 order by r.version desc limit 1`,
    [id, user.institution_id],
  );
  if (!rec) throw new HttpError(404, "No finalized record");
  return new Response(rec.canonical_payload, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${rec.reference}-v${rec.version}.canonical.json"`,
      "cache-control": "private, no-store",
    },
  });
});
