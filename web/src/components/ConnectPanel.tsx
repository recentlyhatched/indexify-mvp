"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BriefcaseBusiness, ChevronRight, ExternalLink, Gavel, ShieldCheck, Store, Wallet } from "lucide-react";
import { api, connectFreighter, FreighterMissing, signXdr } from "@/lib/wallet";
import { buttonClass, cx, Hash } from "./ui";

export type DemoRole = { role: string; label: string; alias: string; wallet: string | null };

const ICONS: Record<string, typeof Store> = { provider: Store, fund_manager: BriefcaseBusiness, compliance_reviewer: ShieldCheck, committee_member: Gavel };
const HOME: Record<string, string> = { provider: "/marketplace", fund_manager: "/marketplace", compliance_reviewer: "/approvals", committee_member: "/approvals" };

/** Freighter sign-in. The wallet signs a one-time, never-submittable challenge; the role always comes from the server. */
export function ConnectPanel({ roles, next }: { roles: DemoRole[]; next?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [picked, setPicked] = useState<string | null>("fund_manager");

  async function connect() {
    setBusy(true);
    setError(null);
    setMissing(false);
    try {
      const address = await connectFreighter();
      const { xdr } = await api<{ xdr: string }>("/api/auth/challenge", { address });
      const signedXdr = await signXdr(xdr, address);
      const res = await api<{ authorized: boolean; user: { role: string } | null }>("/api/auth/verify", { signedXdr });
      if (!res.user) {
        setError("Signed in, but this wallet has no role at a demo institution. Import one of the demo keys below into Freighter.");
        return;
      }
      router.push(next ?? HOME[res.user.role] ?? "/marketplace");
      router.refresh();
    } catch (e) {
      if (e instanceof FreighterMissing) setMissing(true);
      else setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button onClick={connect} disabled={busy} className={cx(buttonClass("primary", "lg"), "w-full")}>
        <Wallet className="h-[18px] w-[18px]" />
        {busy ? "Approve in Freighter…" : "Connect with Freighter"}
      </button>
      {error && <p className="mt-3 rounded-lg bg-danger-50 px-3 py-2 text-[12.5px] text-danger">{error}</p>}
      {missing && (
        <div className="mt-3 rounded-lg border border-warning-500/30 bg-warning-50 p-4 text-[12.5px] leading-relaxed text-body">
          <p className="font-semibold text-ink">Freighter wasn&apos;t detected in this browser.</p>
          <ol className="mt-2 list-decimal space-y-1 pl-4">
            <li>Install the Freighter extension (Chrome, Brave, Edge or Firefox), then reload this page.</li>
            <li>In Freighter, switch the network to <b>Testnet</b>.</li>
            <li>Import a demo key from the list below (<i>Import wallet → private key</i>).</li>
          </ol>
          <p className="mt-2 text-muted">Already installed? Check it&apos;s enabled in this browser profile and allowed on this site, then reload.</p>
          <a href="https://www.freighter.app/" target="_blank" rel="noreferrer" className={cx(buttonClass("secondary", "sm"), "mt-3")}>
            Get Freighter <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      )}

      <div className="my-6 flex items-center gap-3 text-[12.5px] text-muted">
        <span className="h-px flex-1 bg-line" /> demo accounts: one person, one role each <span className="h-px flex-1 bg-line" />
      </div>

      <ul className="space-y-2.5">
        {roles.map((r) => {
          const Icon = ICONS[r.role] ?? Store;
          const open = picked === r.role;
          return (
            <li key={r.role} className={cx("rounded-lg border bg-white transition", open ? "border-primary/50 ring-4 ring-primary/10" : "border-line hover:border-primary/30")}>
              <button type="button" onClick={() => setPicked(open ? null : r.role)} className="flex w-full items-center gap-3 px-4 py-3 text-left" aria-expanded={open}>
                <Icon className="h-[18px] w-[18px] text-primary" />
                <span className="flex-1 text-[14px] font-medium text-ink">{r.label}</span>
                <ChevronRight className={cx("h-4 w-4 text-muted transition", open && "rotate-90 text-primary")} />
              </button>
              {open && (
                <div className="border-t border-line px-4 py-3 text-[12.5px] leading-relaxed text-muted">
                  A separate demo account. To act in this role, import its Testnet key into Freighter, switch to it, then connect above.
                  <div className="mt-2 flex items-center justify-between gap-2 rounded-md bg-paper px-2.5 py-2">
                    <span className="text-[11.5px]">Public key</span>
                    {r.wallet ? <Hash value={r.wallet} chars={6} /> : <span>not configured</span>}
                  </div>
                  <div className="mt-1.5 text-[11.5px]">
                    Secret: <code className="hash rounded bg-paper px-1.5 py-0.5 text-ink">stellar keys show {r.alias}</code>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
