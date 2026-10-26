import Link from "next/link";
import { ConnectPanel, type DemoRole } from "@/components/ConnectPanel";
import { Logo } from "@/components/Logo";

const ROLES: DemoRole[] = [
  { role: "provider", label: "Asset Provider", alias: "pb-provider", wallet: process.env.DEMO_PROVIDER_WALLET ?? null },
  { role: "fund_manager", label: "Fund Manager", alias: "pb-fundmgr", wallet: process.env.DEMO_FUND_MANAGER_WALLET ?? null },
  { role: "compliance_reviewer", label: "Compliance Reviewer", alias: "pb-reviewer", wallet: process.env.DEMO_REVIEWER_WALLET ?? null },
  { role: "committee_member", label: "Investment Committee", alias: "pb-committee", wallet: process.env.DEMO_COMMITTEE_WALLET ?? null },
];

export default async function ConnectPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const safeNext = next?.startsWith("/") && !next.startsWith("//") ? next : undefined;
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4 py-12">
      <div className="w-full max-w-[440px]">
        <div className="rounded-2xl border border-line bg-white px-7 py-9 shadow-[0_20px_50px_-20px_rgba(23,20,44,0.18)] sm:px-9">
          <div className="flex justify-center">
            <Link href="/" aria-label="Home"><Logo size="lg" stacked /></Link>
          </div>
          <h1 className="mt-7 text-center text-[22px] font-bold text-ink">Welcome to PensionBridge</h1>
          <p className="mt-1.5 text-center text-[13.5px] text-muted">Connect your Freighter wallet to continue</p>
          <div className="mt-7">
            <ConnectPanel roles={ROLES} next={safeNext} />
          </div>
        </div>
        <p className="mt-5 text-center text-[12px] text-faint">Stellar Testnet only. Your keys never leave Freighter.</p>
      </div>
    </div>
  );
}
