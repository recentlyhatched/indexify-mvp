import Link from "next/link";
import { Logo } from "./Logo";
import { buttonClass, cx } from "./ui";

/** Public header: landing, connect and verification pages. */
export function SiteHeader({ signedIn, variant = "landing", active }: { signedIn: boolean; variant?: "landing" | "verify"; active?: "how" | "about" }) {
  const item = (on: boolean) => cx("transition hover:text-primary", on && "text-primary");
  return (
    <header className="relative z-20 border-b border-line/70 bg-white/85 backdrop-blur">
      <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-6 px-5 py-3.5 md:px-8">
        <Link href="/" aria-label="PensionBridge Africa home">
          <Logo size="md" />
        </Link>
        {variant === "landing" ? (
          <>
            <nav className="hidden items-center gap-9 text-[13.5px] font-medium text-body md:flex">
              <Link href="/marketplace" className={item(false)}>Products</Link>
              <Link href="/how-it-works" className={item(active === "how")}>How it works</Link>
              <Link href="/about" className={item(active === "about")}>About</Link>
            </nav>
            <Link href={signedIn ? "/marketplace" : "/connect"} className={cx(buttonClass("primary", "sm"), "h-9 px-4")}>
              {signedIn ? "Open dashboard" : "Connect Wallet"}
            </Link>
          </>
        ) : (
          <Link href="/verify" className="text-[13.5px] font-semibold text-ink hover:text-primary">Verify a Record</Link>
        )}
      </div>
      {variant === "landing" && (
        <nav className="flex justify-center gap-7 border-t border-line/70 py-2.5 text-[13px] font-medium text-body md:hidden">
          <Link href="/marketplace" className={item(false)}>Products</Link>
          <Link href="/how-it-works" className={item(active === "how")}>How it works</Link>
          <Link href="/about" className={item(active === "about")}>About</Link>
        </nav>
      )}
    </header>
  );
}
