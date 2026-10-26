import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { sessionWallet } from "@/lib/server/session";
import { networkCheck } from "@/lib/server/chain";
import { contractLink, CONTRACT_ID } from "@/lib/config";
import { SiteHeader } from "@/components/SiteHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { Badge, Hash } from "@/components/ui";

export default async function About() {
  const wallet = await sessionWallet();
  let ledger: number | null = null;
  try {
    ledger = (await networkCheck()).latestLedger;
  } catch {
    ledger = null;
  }
  return (
    <div className="flex min-h-svh flex-col bg-white">
      <SiteHeader signedIn={!!wallet} active="about" />
      <section className="flex-1 bg-white">
        <div className="mx-auto grid max-w-[1200px] gap-10 px-5 py-20 md:grid-cols-[1.3fr_1fr] md:px-8">
          <div>
            <div className="text-[12.5px] font-semibold tracking-[0.12em] text-primary uppercase">About</div>
            <h1 className="mt-2 text-[30px] font-bold tracking-[-0.02em] text-ink">Institutional confidence for a tokenized future.</h1>
            <p className="mt-4 text-[15px] leading-relaxed text-muted">
              PensionBridge Africa is a HackMeridian prototype for Kenyan pension schemes. Providers register evidence and attestations, the scheme
              runs compliance and committee sign-off in sequence, and the final approval is anchored on Stellar so anyone can verify it hasn&apos;t
              changed.
            </p>
            <p className="mt-4 text-[13px] leading-relaxed text-faint">
              Testnet only. All investment activity is hypothetical. Blockchain verification proves record integrity — it is not compliance
              clearance or a legal determination of eligibility.
            </p>
            <Link href="/verify" className="link mt-6 inline-flex items-center gap-1.5 text-[14px]">
              Verify a record <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="rounded-xl border border-line bg-paper p-6">
            <div className="flex items-center justify-between">
              <span className="text-[14px] font-semibold text-ink">Stellar Testnet</span>
              {ledger ? <Badge tone="success" dot>Live</Badge> : <Badge tone="danger" dot>Unavailable</Badge>}
            </div>
            <dl className="mt-4 divide-y divide-line text-[13px]">
              <div className="flex justify-between py-2.5"><dt className="text-muted">Latest ledger</dt><dd className="font-semibold">{ledger?.toLocaleString() ?? "—"}</dd></div>
              <div className="flex justify-between py-2.5"><dt className="text-muted">Contract</dt><dd><Hash value={CONTRACT_ID} href={contractLink()} chars={6} /></dd></div>
            </dl>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
