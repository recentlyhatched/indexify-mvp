import { randomUUID } from "node:crypto";
import { sha256Hex } from "@/lib/canonical";
import { audit, tx } from "@/lib/server/db";
import { HttpError, requireUser } from "@/lib/server/session";
import { assertProviderOwnsProduct, handle } from "@/lib/server/workflow";
import { DOCUMENT_TYPES } from "@/lib/requirements";

const MAX_BYTES = 4 * 1024 * 1024;

/** Provider uploads a document version. The hash is over the exact original file bytes. */
export const POST = handle(async (req: Request) => {
  const user = await requireUser("provider");
  const form = await req.formData();
  const productId = String(form.get("productId") ?? "");
  const documentType = String(form.get("documentType") ?? "");
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Attach a file");
  if (!DOCUMENT_TYPES[documentType]) throw new HttpError(400, "Unknown document type");
  if (file.size > MAX_BYTES) throw new HttpError(413, "File too large for the prototype (4 MB max)");
  await assertProviderOwnsProduct(user, productId);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const hash = await sha256Hex(bytes);
  const storageKey = `documents/${productId}/${randomUUID()}`;
  const doc = await tx(async (c) => {
    await c.query(`select pg_advisory_xact_lock(hashtext($1))`, [`${productId}:${documentType}`]);
    const v = await c.query<{ v: number }>(
      `select coalesce(max(version), 0) + 1 as v from documents where product_id = $1 and document_type = $2`,
      [productId, documentType],
    );
    await c.query(`insert into document_blobs (storage_key, bytes) values ($1, $2)`, [storageKey, Buffer.from(bytes)]);
    const r = await c.query<{ id: string; version: number }>(
      `insert into documents (product_id, document_type, version, file_name, mime_type, size_bytes, storage_key, sha256_hash, uploaded_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id, version`,
      [productId, documentType, v.rows[0].v, file.name, file.type || "application/octet-stream", file.size, storageKey, hash, user.wallet_address],
    );
    await audit(user.wallet_address, user.institution_id, "document.registered", "document", r.rows[0].id, { productId, documentType, version: r.rows[0].version, sha256: hash }, c);
    return r.rows[0];
  });
  return { id: doc.id, version: doc.version, sha256: hash };
});
