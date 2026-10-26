import Link from "next/link";
import { notFound } from "next/navigation";
import { q, q1 } from "@/lib/server/db";
import { currentUser } from "@/lib/server/session";
import { relianceStatus, type AttestationRow, type DocumentRow } from "@/lib/server/evidence";
import { canReadDocument } from "@/lib/server/workflow";
import { ATTESTATION_TYPE_LABEL, DOCUMENT_TYPES } from "@/lib/requirements";
import { Badge, buttonClass, Card, cx, Empty, Field, fmtDate, Hash, PageHeader, StatusBadge, shortWallet, TxHash } from "@/components/ui";

/** Evidence detail view (FR-004): version, hash, applicable attestations and source document. */
export default async function EvidencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const doc = await q1<DocumentRow & { product_name: string }>(
    `select d.*, p.name as product_name from documents d join products p on p.id = d.product_id where d.id = $1`,
    [id],
  );
  if (!doc) notFound();
  const user = await currentUser();
  const canDownload = user ? await canReadDocument(user, doc.product_id) : false;
  const versions = await q<DocumentRow>(`select * from documents where product_id = $1 and document_type = $2 order by version desc`, [doc.product_id, doc.document_type]);
  const atts = await q<AttestationRow>(
    `select a.*, i.name as issuer_institution_name from attestations a join institutions i on i.id = a.issuer_institution_id where a.document_id = $1 order by a.issued_at desc`,
    [id],
  );
  const isLatest = versions[0]?.id === doc.id;

  return (
    <>
      <PageHeader
        back={{ href: `/products/${doc.product_id}?tab=documentation`, label: `Back to ${doc.product_name}` }}
        title={`${DOCUMENT_TYPES[doc.document_type] ?? doc.document_type} · v${doc.version}`}
        actions={canDownload && <a href={`/api/documents/${doc.id}`} className={buttonClass("secondary")}>Download original file</a>}
      >
        {isLatest ? "This is the current version." : "A newer version exists. Attestations on this version do not cover the newer file."}
      </PageHeader>
      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-5">
          <Card title="Document integrity">
            <dl className="divide-y divide-line">
              <Field label="File">{doc.file_name} <span className="text-muted">({(doc.size_bytes / 1024).toFixed(1)} KB, {doc.mime_type})</span></Field>
              <Field label="SHA-256"><span className="hash break-all">{doc.sha256_hash}</span></Field>
              <Field label="Registered">{fmtDate(doc.created_at)} by <span className="hash">{shortWallet(doc.uploaded_by)}</span></Field>
              <Field label="Storage">Private; access-controlled download only</Field>
            </dl>
            {!canDownload && <p className="mt-3 text-[12px] text-muted">Connect an authorized wallet to download.</p>}
          </Card>
          <Card title="Attestations on this exact version">
            {atts.length === 0 ? <Empty>None.</Empty> : (
              <ul className="divide-y divide-line">
                {atts.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-[13px]">
                    <div>
                      <Badge tone={a.attestation_type === "provider_declaration" ? "primary" : "info"}>{ATTESTATION_TYPE_LABEL[a.attestation_type]}</Badge>
                      <span className="ml-2">{a.issuer_institution_name}</span>
                      <div className="mt-1 text-[12px] text-muted">Record <Hash value={a.public_record_id} href={`/verify/${a.public_record_id}`} chars={6} /> · tx <TxHash hash={a.tx_hash} /></div>
                    </div>
                    <StatusBadge status={a.status === "active" ? relianceStatus(a) : a.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <Card title="Version history">
          <ol className="space-y-2">
            {versions.map((v) => (
              <li key={v.id}>
                <Link href={`/evidence/${v.id}`} className={cx("block rounded-lg border p-3 text-[13px] transition", v.id === doc.id ? "border-primary/50 bg-primary-50" : "border-line hover:border-primary/30")}>
                  <div className="flex justify-between"><span className="font-semibold">v{v.version}</span><span className="text-[12px] text-muted">{fmtDate(v.created_at)}</span></div>
                  <span className="hash text-muted">{v.sha256_hash.slice(0, 24)}…</span>
                </Link>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </>
  );
}
