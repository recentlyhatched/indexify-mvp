"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, Briefcase, ClipboardCheck, LogOut, ShieldCheck, Store, UserRound, Wallet, SearchCheck } from "lucide-react";
import { api } from "@/lib/wallet";
import { Logo } from "./Logo";
import { cx } from "./ui";

const ITEMS = [
  { href: "/marketplace", label: "Marketplace", icon: Store, match: (p: string) => /^\/(marketplace|products|evidence|eligibility)/.test(p) },
  { href: "/requests", label: "My Investments", icon: Briefcase, match: (p: string) => p === "/requests" || p === "/requests/new" },
  { href: "/approvals", label: "Approvals", icon: ClipboardCheck, match: (p: string) => p.startsWith("/approvals") || (/^\/requests\/[^/]+(\/approved)?$/.test(p) && p !== "/requests/new") },
  { href: "/attestations", label: "Attestations", icon: ShieldCheck, match: (p: string) => p.startsWith("/attestations") },
  { href: "/dashboard", label: "Reports", icon: BarChart3, match: (p: string) => p.startsWith("/dashboard") },
];

type Props = { user: { display_name: string; role_label: string } | null; wallet: string | null };

function UserChip({ user, wallet }: Props) {
  const router = useRouter();
  async function logout() {
    await api("/api/auth/logout");
    router.push("/connect");
  }
  if (!wallet) {
    return (
      <Link href="/connect" className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-[13px] font-semibold text-white hover:bg-primary-600">
        <Wallet className="h-4 w-4" /> Connect wallet
      </Link>
    );
  }
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink text-white">
        <UserRound className="h-4.5 w-4.5" />
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-[13px] font-semibold text-ink">{user?.display_name.split(" · ")[0] ?? "Unassigned wallet"}</div>
        <div className="truncate text-[11.5px] text-muted">{user?.role_label ?? `${wallet.slice(0, 4)}…${wallet.slice(-4)}`}</div>
      </div>
      <button onClick={logout} title="Disconnect" aria-label="Disconnect wallet" className="rounded-md p-1.5 text-faint transition hover:bg-paper hover:text-ink">
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}

export function Sidebar(props: Props) {
  const path = usePathname();
  return (
    <>
      {/* Desktop */}
      <aside className="sticky top-0 hidden h-screen w-[232px] shrink-0 flex-col border-r border-line bg-white px-4 py-5 md:flex">
        <Link href="/" className="px-2">
          <Logo size="sm" />
        </Link>
        <nav className="mt-8 space-y-1">
          {ITEMS.map((it) => {
            const active = it.match(path);
            return (
              <Link
                key={it.href}
                href={it.href}
                className={cx(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13.5px] transition",
                  active ? "bg-primary-50 font-semibold text-primary" : "text-body hover:bg-paper hover:text-ink",
                )}
              >
                <it.icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.2 : 1.8} />
                {it.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto space-y-4">
          <Link href="/verify" className="flex items-center gap-3 rounded-lg px-3 py-2 text-[12.5px] text-muted transition hover:bg-paper hover:text-ink">
            <SearchCheck className="h-4 w-4" /> Public verification
          </Link>
          <div className="border-t border-line pt-4">
            <UserChip {...props} />
          </div>
        </div>
      </aside>

      {/* Mobile */}
      <div className="sticky top-0 z-30 border-b border-line bg-white md:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Link href="/">
            <Logo size="sm" />
          </Link>
          {props.wallet ? (
            <span className="text-[12px] text-muted">{props.user?.role_label ?? "Unassigned"}</span>
          ) : (
            <Link href="/connect" className="text-[13px] font-semibold text-primary">Connect wallet</Link>
          )}
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2 [scrollbar-width:none]">
          {ITEMS.map((it) => (
            <Link
              key={it.href}
              href={it.href}
              className={cx("flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px]", it.match(path) ? "bg-primary-50 font-semibold text-primary" : "text-body")}
            >
              <it.icon className="h-4 w-4" /> {it.label}
            </Link>
          ))}
        </nav>
      </div>
    </>
  );
}
