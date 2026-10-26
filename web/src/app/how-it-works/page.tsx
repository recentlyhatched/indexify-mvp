import Link from "next/link";
import { sessionWallet } from "@/lib/server/session";
import { SiteHeader } from "@/components/SiteHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { buttonClass } from "@/components/ui";

const STEPS = [
  { role: "Asset provider", title: "Register documentation", body: "Each document upload becomes a new version, hashed over its exact bytes." },
  { role: "Provider · Reviewer", title: "Issue attestations", body: "Declarations and independent reviews are signed in Freighter and registered on Soroban." },
  { role: "Fund manager", title: "Check eligibility", body: "Evidence, expiry and revocation are evaluated against the scheme's checklist." },
  { role: "Fund manager", title: "Submit a request", body: "A hypothetical allocation enters a strictly sequential review." },
  { role: "Committee", title: "Approve & anchor", body: "The approval is frozen as a canonical record and its hash anchored on Stellar." },
  { role: "Anyone", title: "Verify integrity", body: "Anyone can recompute the hash and compare it with the on-chain record." },
];

export default async function HowItWorks() {
  const wallet = await sessionWallet();
  return (
    <div className="flex min-h-svh flex-col bg-white">
      <SiteHeader signedIn={!!wallet} active="how" />
      <section className="flex-1 bg-paper">
        <div className="mx-auto max-w-[1200px] px-5 py-20 md:px-8">
          <div className="max-w-2xl">
            <div className="text-[12.5px] font-semibold tracking-[0.12em] text-primary uppercase">How it works</div>
            <h1 className="mt-2 text-[30px] font-bold tracking-[-0.02em] text-ink md:text-[36px]">Evaluate. Approve. Verify. On-chain.</h1>
            <p className="mt-3 text-[15px] leading-relaxed text-muted">One working path from a provider&apos;s document to a public integrity check. Confidential details stay with the institution.</p>
          </div>
          <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="rounded-xl border border-line bg-white p-6 shadow-[0_1px_3px_rgba(23,20,44,0.04)]">
                <div className="flex items-center justify-between">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-primary-50 text-[14px] font-bold text-primary">{i + 1}</span>
                  <span className="text-[12px] font-medium text-muted">{s.role}</span>
                </div>
                <h3 className="mt-5 text-[16px] font-semibold text-ink">{s.title}</h3>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{s.body}</p>
              </li>
            ))}
          </ol>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link href={wallet ? "/marketplace" : "/connect"} className={buttonClass("primary", "lg")}>Get Started</Link>
            <Link href="/verify" className={buttonClass("secondary", "lg")}>Verify a record</Link>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
