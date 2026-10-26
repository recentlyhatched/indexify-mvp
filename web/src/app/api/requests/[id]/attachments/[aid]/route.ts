import { q1 } from "@/lib/server/db";
import { HttpError, requireUser } from "@/lib/server/session";
import { handle, loadRequest } from "@/lib/server/workflow";

/** Download a request's supporting document. Institution members only. */
export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string; aid: string }> }) => {
  const user = await requireUser();
  if (user.role === "provider") throw new HttpError(404, "Document not found");
  const { id, aid } = await ctx.params;
  await loadRequest(user, id);
  const a = await q1<{ file_name: string; mime_type: string; bytes: Buffer }>(
    `select file_name, mime_type, bytes from request_attachments where id = $1 and request_id = $2`,
    [aid, id],
  );
  if (!a) throw new HttpError(404, "Document not found");
  return new Response(new Uint8Array(a.bytes), {
    headers: {
      "content-type": a.mime_type,
      "content-disposition": `attachment; filename="${a.file_name.replace(/"/g, "")}"`,
      "cache-control": "private, no-store",
    },
  });
});
