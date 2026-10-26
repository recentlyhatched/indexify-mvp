import { sha256Hex } from "@/lib/canonical";
import { audit, q1 } from "@/lib/server/db";
import { HttpError, requireUser } from "@/lib/server/session";
import { handle, loadRequest } from "@/lib/server/workflow";

const MAX_BYTES = 4 * 1024 * 1024;

/** Fund manager attaches a supporting document to a request still under review. */
export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser("fund_manager");
  const { id } = await ctx.params;
  const r = await loadRequest(user, id);
  if (!["draft", "compliance_review"].includes(r.status)) throw new HttpError(409, "Documents can only be attached before compliance clearance");
  const file = (await req.formData()).get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Attach a file");
  if (file.size > MAX_BYTES) throw new HttpError(413, "File too large for the prototype (4 MB max)");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const hash = await sha256Hex(bytes);
  const row = await q1<{ id: string }>(
    `insert into request_attachments (request_id, file_name, mime_type, size_bytes, sha256_hash, bytes, uploaded_by)
     values ($1,$2,$3,$4,$5,$6,$7) returning id`,
    [id, file.name, file.type || "application/octet-stream", file.size, hash, Buffer.from(bytes), user.wallet_address],
  );
  await audit(user.wallet_address, user.institution_id, "request.document_attached", "investment_request", id, { fileName: file.name, sha256: hash });
  return { id: row!.id, sha256: hash };
});
