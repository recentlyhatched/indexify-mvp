import { requireUser } from "@/lib/server/session";
import { handle } from "@/lib/server/workflow";
import { allAttestations, complianceExceptions, requestSummaries } from "@/lib/server/reports";
import { ATTESTATION_TYPE_LABEL, REQUEST_STATUS_LABEL } from "@/lib/requirements";
import { CONTRACT_ID, txLink } from "@/lib/config";

const esc = (s: unknown) =>
  String(s ?? "—").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const short = (s: string | null) => (s ? `${s.slice(0, 10)}…${s.slice(-6)}` : "—");

/** Downloadable sample institutional report (FR-030). */
export const GET = handle(async () => {
  const user = await requireUser("fund_manager", "compliance_reviewer", "committee_member");
  const [requests, atts, exceptions] = await Promise.all([
    requestSummaries(user.institution_id),
    allAttestations(),
    complianceExceptions(user.institution_id),
  ]);
  const approved = requests.filter((r) => ["approved", "anchoring_pending", "blockchain_verified"].includes(r.status));
  const byCurrency = new Map<string, bigint>();
  for (const r of approved) {
    const cents = BigInt(r.amount.replace(".", ""));
    byCurrency.set(r.currency, (byCurrency.get(r.currency) ?? 0n) + cents);
  }
  const fmt = (cents: bigint) => `${(cents / 100n).toLocaleString("en-US")}.${String(cents % 100n).padStart(2, "0")}`;
  const generated = new Date().toISOString();

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>PensionBridge institutional report</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body{font:14px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;color:#0f172a;margin:40px auto;max-width:980px;padding:0 20px}
h1{font-size:22px;margin:0}h2{font-size:15px;margin:32px 0 8px;text-transform:uppercase;letter-spacing:.06em;color:#334155}
.meta{color:#64748b;font-size:12px}.banner{background:#fef3c7;border:1px solid #f59e0b;padding:10px 14px;border-radius:8px;margin:16px 0;font-size:13px}
table{width:100%;border-collapse:collapse;font-size:12.5px}th,td{text-align:left;padding:7px 8px;border-bottom:1px solid #e2e8f0;vertical-align:top}
th{background:#f8fafc;font-weight:600}code{font-size:11.5px}
</style></head><body>
<h1>PensionBridge Africa — Institutional review report</h1>
<div class="meta">${esc(user.institution_name)} · generated ${esc(generated)} by ${esc(user.display_name)} · Stellar Testnet contract <code>${esc(CONTRACT_ID)}</code></div>
<div class="banner"><strong>Sample report — prototype.</strong> Investment activity is hypothetical. Blockchain verification proves record integrity only; it is not a compliance clearance or a legal determination of eligibility for Kenyan pension schemes.</div>

<h2>Illustrative portfolio (approved, hypothetical)</h2>
<table><tr><th>Currency</th><th>Approved amount</th><th>Requests</th></tr>
${[...byCurrency].map(([c, v]) => `<tr><td>${esc(c)}</td><td>${esc(fmt(v))}</td><td>${approved.filter((r) => r.currency === c).length}</td></tr>`).join("") || `<tr><td colspan="3">No approved requests</td></tr>`}
</table>

<h2>Approval history</h2>
<table><tr><th>Reference</th><th>Product</th><th>Amount</th><th>Status</th><th>Record hash</th><th>Transaction</th></tr>
${requests.map((r) => `<tr><td>${esc(r.reference)}</td><td>${esc(r.product_name)}</td><td>${esc(r.currency)} ${esc(r.amount)}</td><td>${esc(REQUEST_STATUS_LABEL[r.status])}</td><td><code>${esc(short(r.payload_hash))}</code></td><td>${r.tx_hash ? `<a href="${esc(txLink(r.tx_hash))}"><code>${esc(short(r.tx_hash))}</code></a>` : "—"}</td></tr>`).join("") || `<tr><td colspan="6">No requests</td></tr>`}
</table>

<h2>Compliance exceptions</h2>
<table><tr><th>Type</th><th>Subject</th><th>Detail</th></tr>
${exceptions.map((e) => `<tr><td>${esc(e.kind.replace(/_/g, " "))}</td><td>${esc(e.subject)}</td><td>${esc(e.message)}</td></tr>`).join("") || `<tr><td colspan="3">No open exceptions</td></tr>`}
</table>

<h2>Attestation register</h2>
<table><tr><th>Type</th><th>Product</th><th>Scope</th><th>Issuer</th><th>Status for reliance</th><th>Expires</th><th>Record ID</th></tr>
${atts.map((a) => `<tr><td>${esc(ATTESTATION_TYPE_LABEL[a.attestation_type])}</td><td>${esc(a.product_name)}</td><td>${esc(a.review_scope)}</td><td>${esc(a.issuer_institution_name)}</td><td>${esc(a.reliance)}</td><td>${esc(a.expires_at?.toISOString() ?? "none")}</td><td><code>${esc(short(a.public_record_id))}</code></td></tr>`).join("") || `<tr><td colspan="7">No attestations</td></tr>`}
</table>
</body></html>`;

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-disposition": `attachment; filename="pensionbridge-report-${generated.slice(0, 10)}.html"`,
      "cache-control": "private, no-store",
    },
  });
});
