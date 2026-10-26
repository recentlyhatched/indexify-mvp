import Link from "next/link";
import { AlertTriangle, CheckCircle2, Download, Hourglass, Layers, ShieldCheck } from "lucide-react";
import { q } from "@/lib/server/db";
import { currentUser } from "@/lib/server/session";
import { allAttestations, complianceExceptions, requestSummaries } from "@/lib/server/reports";
import { Badge, buttonClass, Card, Empty, Notice, PageHeader, Stat, Tabs } from "@/components/ui";
import { RequestTable } from "@/components/RequestTable";
import { AttestationTable } from "@/components/AttestationTable";

const EXC_LABEL = {
  missing_evidence: ["Missing / mismatched evidence", "danger"],
  expired_attestation: ["Expired attestation", "warning"],
  revoked_attestation: ["Revoked attestation", "danger"],
  failed_anchoring: ["Failed anchoring", "danger"],
  pending_anchoring: ["Pending anchoring", "warning"],
} as const;

/** Institution dashboard & reporting (FR-027, FR-029, FR-030). */
export default async function Dashboard({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const user = await currentUser();
  if (!user || user.role === "provider") {
    return (
      <>
        <PageHeader title="Institution Dashboard" />
        <Notice tone="blue">Confidential scheme reports are available to the institution&apos;s fund manager, compliance reviewer and committee.</Notice>
      </>
    );
  }
  const tab = (await searchParams).tab ?? "investments";
  const [requests, atts, exceptions] = await Promise.all([requestSummaries(user.institution_id), allAttestations(), complianceExceptions(user.institution_id)]);
  const tickers = new Map((await q<{ id: string; ticker: string | null }>(`select id, ticker from products`)).map((p) => [p.id, p.ticker]));
  const approved = requests.filter((r) => ["approved", "anchoring_pending", "blockchain_verified"].includes(r.status)).length;
  const review = requests.filter((r) => ["compliance_review", "committee_review"].includes(r.status)).length;

  return (
    <>
      <PageHeader
        title="Institution Dashboard"
        actions={
          <a href="/api/reports/sample" className={buttonClass("outline")}>
            <Download className="h-4 w-4" /> Download Report
          </a>
        }
      >
        Overview of your investments, approvals and attestations at {user.institution_name}. Figures are illustrative.
      </PageHeader>

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="Total Investments" value={requests.length} icon={<Layers />} />
        <Stat label="Approved" value={approved} icon={<CheckCircle2 />} tone="success" />
        <Stat label="Under Review" value={review} icon={<Hourglass />} tone="warning" />
        <Stat label="Attestations" value={atts.length} icon={<ShieldCheck />} />
        <Stat label="Open Exceptions" value={exceptions.length} icon={<AlertTriangle />} tone={exceptions.length ? "danger" : "success"} />
      </div>

      <Card bodyClassName="pt-3">
        <Tabs
          active={tab}
          items={[
            { key: "investments", label: "Investments", href: "/dashboard?tab=investments" },
            { key: "attestations", label: "Attestations", href: "/dashboard?tab=attestations" },
            { key: "exceptions", label: `Compliance Exceptions${exceptions.length ? ` (${exceptions.length})` : ""}`, href: "/dashboard?tab=exceptions" },
          ]}
        />
        {tab === "investments" && <RequestTable rows={requests.map((r) => ({ ...r, ticker: tickers.get(r.product_id) }))} />}
        {tab === "attestations" && <AttestationTable rows={atts} />}
        {tab === "exceptions" &&
          (exceptions.length === 0 ? (
            <Empty>No open exceptions.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {exceptions.map((e, i) => (
                <li key={i}>
                  <Link href={e.href} className="flex flex-col gap-2 py-3 transition hover:bg-paper sm:flex-row sm:items-center sm:gap-4 sm:px-2">
                    <Badge tone={EXC_LABEL[e.kind][1]}>{EXC_LABEL[e.kind][0]}</Badge>
                    <span className="flex-1 text-[13px] text-ink">{e.message}</span>
                    <span className="text-[12px] text-muted">{e.subject}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ))}
      </Card>
    </>
  );
}
