import { Ban, CheckCircle2, Clock, Hourglass } from "lucide-react";
import { allAttestations } from "@/lib/server/reports";
import { currentUser } from "@/lib/server/session";
import { Card, Notice, PageHeader, Stat } from "@/components/ui";
import { AttestationTable } from "@/components/AttestationTable";

/** Attestation register (FR-028): active, expired and revoked attestations, with history preserved. */
export default async function AttestationRegister() {
  const user = await currentUser();
  const rows = user ? await allAttestations() : [];
  const counts = { active: 0, expired: 0, revoked: 0, not_anchored: 0 };
  for (const r of rows) counts[r.reliance]++;

  return (
    <>
      <PageHeader title="Attestations">
        Provider declarations and independent review attestations. An attestation is a statement about a specific claim or activity — on its
        own it does not establish that an investment meets every pension regulation.
      </PageHeader>
      {!user ? (
        <Notice tone="blue">Connect an authorized wallet to view the register. Anyone can check an individual record on the public verification page.</Notice>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Active" value={counts.active} icon={<CheckCircle2 />} tone="success" />
            <Stat label="Expired" value={counts.expired} icon={<Clock />} tone="warning" />
            <Stat label="Revoked" value={counts.revoked} icon={<Ban />} tone="danger" />
            <Stat label="Pending anchoring" value={counts.not_anchored} icon={<Hourglass />} />
          </div>
          <Card>
            <AttestationTable rows={rows} />
          </Card>
        </>
      )}
    </>
  );
}
