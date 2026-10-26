import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertCircle, CheckCircle2, ChevronLeft, Circle, CircleDot, XCircle } from "lucide-react";
import { q, q1 } from "@/lib/server/db";
import { currentUser } from "@/lib/server/session";
import { evaluate, productAttestations, relianceStatus, type DocumentRow, type Evaluation, type ItemEvaluation } from "@/lib/server/evidence";
import { canReadDocument } from "@/lib/server/workflow";
import { ATTESTATION_TYPE_LABEL, DOCUMENT_TYPES, REQUIREMENTS, REVIEW_SCOPES, REVIEW_STATUS_LABEL } from "@/lib/requirements";
import { Badge, ButtonLink, Card, cx, Empty, Field, fmtDate, Hash, Monogram, Notice, StatusBadge, Tabs, TxHash, type Tone } from "@/components/ui";
import { AttestationActions, IssueAttestation, UploadDocument } from "@/components/ProductActions";
import { ChecklistItemEditor } from "@/components/ChecklistItem";

type Product = {
  id: string;
  name: string;
  issuer: string;
  issuer_short: string | null;
  ticker: string | null;
  tags: string[];
  underlying_exposure: string;
  legal_structure: string;
  custody_summary: string;
  eligibility_notes: string;
  source_urls: { label: string; url: string }[];
  data_confidence: Record<string, string>;
  is_illustrative: boolean;
  provider_institution_id: string;
  provider_name: string;
};

const TABS = ["overview", "documentation", "eligibility", "attestations"] as const;
type Tab = (typeof TABS)[number];

function itemView(i: ItemEvaluation): { tone: Tone; label: string; icon: typeof Circle; color: string } {
  if (i.effectiveStatus === "reviewed") return { tone: "success", label: "Complete", icon: CheckCircle2, color: "text-success-500" };
  if (i.exceptions.length || i.effectiveStatus === "exception") return { tone: "danger", label: i.effectiveStatus === "missing" ? "Missing" : "Exception", icon: XCircle, color: "text-danger" };
  if (i.effectiveStatus === "submitted" || i.requirement.legalReview) return { tone: "warning", label: "Review required", icon: AlertCircle, color: "text-warning-500" };
  return { tone: "neutral", label: "Not checked", icon: Circle, color: "text-faint" };
}

function overall(ev: Evaluation) {
  if (ev.status === "evidence_complete") return { color: "text-success", bg: "bg-success-500", icon: CheckCircle2, text: "Every configured requirement has supporting evidence and valid attestations. Human legal review remains a separate step." };
  if (ev.status === "needs_legal_review") return { color: "text-warning", bg: "bg-warning-500", icon: AlertCircle, text: "Some items require additional legal or compliance review before proceeding." };
  return { color: "text-danger", bg: "bg-danger", icon: XCircle, text: "Evidence is missing, mismatched, expired or revoked. Progression is blocked until it is resolved." };
}

export default async function ProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const product = await q1<Product>(
    `select p.*, i.name as provider_name from products p left join institutions i on i.id = p.provider_institution_id where p.id = $1`,
    [id],
  );
  if (!product) notFound();
  const user = await currentUser();
  const isInstitution = !!user && user.role !== "provider";
  const tabParam = (await searchParams).tab as Tab | undefined;
  const tab: Tab = tabParam && TABS.includes(tabParam) ? tabParam : isInstitution && !product.is_illustrative ? "eligibility" : "overview";

  const docs = await q<DocumentRow>(`select * from documents where product_id = $1 order by document_type, version desc`, [id]);
  const atts = await productAttestations(id);
  const ev = isInstitution && !product.is_illustrative ? await evaluate(user.institution_id, id) : null;
  const canSeeDocs = user ? await canReadDocument(user, id) : false;
  const isOwnerProvider = user?.role === "provider" && user.institution_id === product.provider_institution_id;
  const canEditChecklist = user?.role === "fund_manager" || user?.role === "compliance_reviewer";
  const latestIds = new Set(docs.filter((d, i) => i === 0 || docs[i - 1].document_type !== d.document_type).map((d) => d.id));
  const docOptions = docs.map((d) => ({ id: d.id, label: `${DOCUMENT_TYPES[d.document_type] ?? d.document_type} · v${d.version}${latestIds.has(d.id) ? " (latest)" : ""}` }));
  const c = product.data_confidence;
  const issuerShort = product.issuer_short ?? product.issuer;

  return (
    <>
      <Link href="/marketplace" className="mb-4 inline-flex items-center gap-1 text-[13px] text-muted transition hover:text-ink">
        <ChevronLeft className="h-4 w-4" /> Back to Marketplace
      </Link>
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <Monogram name={issuerShort} size={56} />
          <div className="min-w-0">
            <div className="text-[12.5px] font-medium text-muted">{issuerShort}</div>
            <h1 className="text-[22px] font-bold tracking-[-0.01em] text-ink">
              {product.name}
              {product.ticker && ` (${product.ticker})`}
            </h1>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {product.tags.map((t) => <Badge key={t} tone={t === "Illustrative" ? "warning" : "primary"}>{t}</Badge>)}
              {!product.is_illustrative && <Badge tone="neutral">Research reference</Badge>}
            </div>
          </div>
        </div>
        {user?.role === "fund_manager" && !product.is_illustrative && <ButtonLink href={`/requests/new?product=${id}`}>Request Investment</ButtonLink>}
      </div>

      <div className="rounded-xl border border-line bg-white px-5 pt-3 pb-5 shadow-[0_1px_3px_rgba(23,20,44,0.04)] md:px-6">
        <Tabs
          active={tab}
          items={[
            { key: "overview", label: "Overview", href: `/products/${id}?tab=overview` },
            { key: "documentation", label: "Documentation", href: `/products/${id}?tab=documentation` },
            { key: "eligibility", label: "Eligibility Checker", href: `/products/${id}?tab=eligibility` },
            { key: "attestations", label: "Attestations", href: `/products/${id}?tab=attestations` },
          ]}
        />

        {tab === "overview" && (
          <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
            <div className="@container">
              <h2 className="mb-1 text-[15px] font-semibold">Product information</h2>
              <p className="mb-3 text-[12.5px] text-muted">Each field is labelled by how it was sourced. Not an offer; nothing here is executable.</p>
              <dl className="divide-y divide-line border-y border-line">
                <Field label="Issuer" confidence={c.issuer}>{product.issuer}</Field>
                <Field label="Ticker" confidence={c.ticker}>{product.ticker ?? "—"}</Field>
                <Field label="Underlying exposure" confidence={c.underlying_exposure}>{product.underlying_exposure}</Field>
                <Field label="Legal structure" confidence={c.legal_structure}>{product.legal_structure}</Field>
                <Field label="Custody" confidence={c.custody_summary}>{product.custody_summary}</Field>
                <Field label="Eligibility notes" confidence={c.eligibility_notes}>{product.eligibility_notes}</Field>
                <Field label="Listed by">{product.provider_name}</Field>
              </dl>
            </div>
            <div className="space-y-4">
              {product.source_urls.length > 0 && (
                <div className="rounded-xl bg-paper p-4">
                  <h3 className="text-[13.5px] font-semibold">Sources</h3>
                  <ul className="mt-2 space-y-1.5 text-[13px]">
                    {product.source_urls.map((s) => (
                      <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer" className="link">{s.label} ↗</a></li>
                    ))}
                  </ul>
                </div>
              )}
              {!product.is_illustrative && (
                <div className="rounded-xl bg-paper p-4">
                  <h3 className="text-[13.5px] font-semibold">Required evidence</h3>
                  <ul className="mt-2 space-y-2 text-[12.5px]">
                    {REQUIREMENTS.map((r) => (
                      <li key={r.code} className="flex justify-between gap-3"><span>{r.title}</span><span className="text-right text-muted">{DOCUMENT_TYPES[r.documentType]}</span></li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "documentation" && (
          <div className="space-y-6">
            {docs.length === 0 ? (
              <Empty>No documents registered yet.</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-[13px]">
                  <thead>
                    <tr className="border-b border-line text-left text-[12px] text-muted">
                      <th className="py-2.5 pr-4 font-medium">Document</th>
                      <th className="py-2.5 pr-4 font-medium">Version</th>
                      <th className="py-2.5 pr-4 font-medium">SHA-256</th>
                      <th className="py-2.5 pr-4 font-medium">Registered</th>
                      <th className="py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {docs.map((d) => (
                      <tr key={d.id} className={latestIds.has(d.id) ? "" : "text-muted"}>
                        <td className="py-3 pr-4 font-medium">{DOCUMENT_TYPES[d.document_type] ?? d.document_type}</td>
                        <td className="py-3 pr-4">v{d.version} <span className="ml-1">{latestIds.has(d.id) ? <Badge tone="success">Latest</Badge> : <Badge>Superseded</Badge>}</span></td>
                        <td className="py-3 pr-4"><Hash value={d.sha256_hash} chars={8} /></td>
                        <td className="py-3 pr-4 text-[12px]">{fmtDate(d.created_at)}</td>
                        <td className="py-3 text-right"><Link href={`/evidence/${d.id}`} className="link text-[12.5px]">Details</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {!canSeeDocs && docs.length > 0 && <p className="text-[12px] text-muted">Connect an authorized wallet to download documents. Files are held in private storage.</p>}
            {isOwnerProvider && (
              <div className="rounded-xl border border-line p-5">
                <h3 className="mb-3 text-[14px] font-semibold">Register a document version</h3>
                <UploadDocument productId={id} />
              </div>
            )}
          </div>
        )}

        {tab === "eligibility" &&
          (!ev ? (
            <Notice tone="blue">
              {product.is_illustrative
                ? "Illustrative listings have no eligibility checklist."
                : "The checklist is maintained by the pension institution. Connect as the fund manager, compliance reviewer or committee member to view it."}
            </Notice>
          ) : (
            <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
              <div className="rounded-xl border border-line">
                <h2 className="border-b border-line px-5 py-3.5 text-[14px] font-semibold">Eligibility Checklist</h2>
                <ul className="divide-y divide-line">
                  {ev.items.map((i) => {
                    const v = itemView(i);
                    return (
                      <li key={i.requirement.code} className="px-5 py-3.5">
                        <div className="flex items-start gap-3">
                          <v.icon className={cx("mt-0.5 h-5 w-5 shrink-0", v.color)} />
                          <div className="min-w-0 flex-1">
                            <div className="text-[13.5px] font-medium text-ink">{i.requirement.title}</div>
                            <div className="mt-0.5 text-[12px] text-muted">
                              {i.document ? (
                                <Link href={`/evidence/${i.document.id}`} className="link font-normal">{DOCUMENT_TYPES[i.document.document_type]} v{i.document.version}</Link>
                              ) : (
                                `${DOCUMENT_TYPES[i.requirement.documentType]} not on file`
                              )}
                              {i.requirement.attestation && <> · requires {ATTESTATION_TYPE_LABEL[i.requirement.attestation.type].toLowerCase()}</>}
                            </div>
                            {i.exceptions.map((m) => <div key={m} className="mt-1 text-[12px] font-medium text-danger">{m}</div>)}
                            {i.notes && <div className="mt-1 text-[12px] text-muted italic">“{i.notes}”</div>}
                          </div>
                          <Badge tone={v.tone}>{v.label}</Badge>
                        </div>
                        {canEditChecklist && (
                          <details className="group mt-2 ml-8">
                            <summary className="cursor-pointer list-none text-[12px] font-semibold text-primary hover:text-primary-600">
                              <span className="group-open:hidden">Update item</span>
                              <span className="hidden group-open:inline">Close</span>
                            </summary>
                            <ChecklistItemEditor productId={id} code={i.requirement.code} manualStatus={i.manualStatus} notes={i.notes} role={user!.role} hasDocument={!!i.document} />
                          </details>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>

              <div className="space-y-4">
                {(() => {
                  const o = overall(ev);
                  const pending = ev.items.filter((i) => i.effectiveStatus !== "reviewed");
                  return (
                    <div className="rounded-xl bg-paper p-5">
                      <h2 className="text-[14px] font-semibold">Overall Status</h2>
                      <div className={cx("mt-4 flex items-center gap-2.5 text-[14px] font-semibold", o.color)}>
                        <span className={cx("grid h-7 w-7 place-items-center rounded-full text-white", o.bg)}><o.icon className="h-4 w-4" /></span>
                        {REVIEW_STATUS_LABEL[ev.status]}
                      </div>
                      <p className="mt-3 text-[13px] leading-relaxed text-body">{o.text}</p>
                      <h3 className="mt-5 text-[13.5px] font-semibold">Next Steps</h3>
                      <ul className="mt-2 space-y-2 text-[12.5px] text-body">
                        {pending.slice(0, 4).map((i) => (
                          <li key={i.requirement.code} className="flex gap-2"><CircleDot className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />{i.exceptions[0] ? `Resolve: ${i.requirement.title}` : `Review ${i.requirement.title.toLowerCase()}`}</li>
                        ))}
                        {ev.items.some((i) => i.requirement.legalReview) && (
                          <li className="flex gap-2"><CircleDot className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />Obtain legal assessment of Kenyan eligibility</li>
                        )}
                        <li className="flex gap-2"><CircleDot className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />Continue to investment request when ready</li>
                      </ul>
                    </div>
                  );
                })()}
                <p className="px-1 text-[11.5px] leading-relaxed text-faint">
                  Completing the checklist is not a regulatory approval. It is a workflow and evidence-management tool, not an automated legal decision engine.
                </p>
              </div>
            </div>
          ))}

        {tab === "attestations" && (
          <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
            <div>
              {atts.length === 0 ? (
                <Empty>No attestations issued for this product.</Empty>
              ) : (
                <ul className="space-y-3">
                  {atts.map((a) => {
                    const rs = relianceStatus(a);
                    const mine = user?.wallet_address === a.issuer_wallet;
                    return (
                      <li key={a.id} className="rounded-xl border border-line p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge tone={a.attestation_type === "provider_declaration" ? "primary" : "info"}>{ATTESTATION_TYPE_LABEL[a.attestation_type]}</Badge>
                            <span className="text-[13px] font-medium">{REVIEW_SCOPES[a.attestation_type][a.review_scope] ?? a.review_scope}</span>
                          </div>
                          <StatusBadge status={a.status === "active" ? rs : a.status} label={a.status === "active" && rs === "expired" ? "Expired for new reliance" : undefined} />
                        </div>
                        <p className="mt-2 text-[13px] text-body">“{a.claim}”</p>
                        <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-[12px] sm:grid-cols-2">
                          <div><dt className="inline text-muted">Issuer: </dt><dd className="inline">{a.issuer_institution_name}</dd></div>
                          <div><dt className="inline text-muted">Issued: </dt><dd className="inline">{fmtDate(a.issued_at)}</dd></div>
                          <div><dt className="inline text-muted">Expires: </dt><dd className="inline">{a.expires_at ? fmtDate(a.expires_at) : "No expiry"}</dd></div>
                          <div><dt className="inline text-muted">Document hash: </dt><dd className="inline"><Hash value={a.document_hash} chars={6} /></dd></div>
                          <div><dt className="inline text-muted">Record ID: </dt><dd className="inline"><Hash value={a.public_record_id} href={`/verify/${a.public_record_id}`} chars={6} /></dd></div>
                          <div><dt className="inline text-muted">Registration tx: </dt><dd className="inline"><TxHash hash={a.tx_hash} /></dd></div>
                          {a.revoke_tx_hash && <div><dt className="inline text-muted">Revocation tx: </dt><dd className="inline"><TxHash hash={a.revoke_tx_hash} /></dd></div>}
                        </dl>
                        {mine && user && a.status !== "revoked" && (
                          <div className="mt-3 border-t border-line pt-3">
                            <AttestationActions recordId={a.public_record_id} wallet={user.wallet_address} canRevoke={a.status === "active"} needsAnchoring={a.status === "anchoring_pending" || a.status === "retry_required"} />
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="space-y-4">
              {isOwnerProvider && (
                <Card title="Issue provider declaration" subtitle="Signed with your Freighter wallet">
                  <IssueAttestation productId={id} wallet={user!.wallet_address} type="provider_declaration" documents={docOptions} />
                </Card>
              )}
              {user?.role === "compliance_reviewer" && !product.is_illustrative && (
                <Card title="Issue independent review" subtitle="Attests to a review activity — not to legal approval">
                  <IssueAttestation productId={id} wallet={user.wallet_address} type="independent_review" documents={docOptions} />
                </Card>
              )}
              {!user && <Notice tone="blue">Connect a demo wallet to issue attestations.</Notice>}
              <p className="text-[11.5px] leading-relaxed text-faint">Provider declarations and independent reviews are distinct types. Revoked records stay visible.</p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
