import { q1 } from "@/lib/server/db";
import { HttpError, requireUser } from "@/lib/server/session";
import { canReadDocument, handle } from "@/lib/server/workflow";

/** Access-controlled download from private storage. */
export const GET = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const doc = await q1<{ product_id: string; file_name: string; mime_type: string; bytes: Buffer }>(
    `select d.product_id, d.file_name, d.mime_type, b.bytes from documents d join document_blobs b on b.storage_key = d.storage_key where d.id = $1`,
    [id],
  );
  if (!doc || !(await canReadDocument(user, doc.product_id))) throw new HttpError(404, "Document not found");
  return new Response(new Uint8Array(doc.bytes), {
    headers: {
      "content-type": doc.mime_type,
      "content-disposition": `attachment; filename="${doc.file_name.replace(/"/g, "")}"`,
      "cache-control": "private, no-store",
    },
  });
});
