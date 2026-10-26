import Link from "next/link";
import { ClipboardList, Globe2, Landmark, Link2 } from "lucide-react";
import { sessionWallet } from "@/lib/server/session";
import { SiteHeader } from "@/components/SiteHeader";
import Image from "next/image";
import { buttonClass } from "@/components/ui";

const FEATURES = [
  { icon: Globe2, label: "Global investment access" },
  { icon: ClipboardList, label: "Structured compliance workflow" },
  { icon: Link2, label: "On-chain verification" },
  { icon: Landmark, label: "Built for pension institutions" },
];

export default async function Landing() {
  const wallet = await sessionWallet();

  return (
    <div className="flex min-h-svh flex-col bg-white">
      <SiteHeader signedIn={!!wallet} />

      <section className="relative flex flex-1 items-center overflow-hidden">
        <Image src="/hero-nairobi.jpg" alt="Nairobi skyline with the Kenyatta International Convention Centre" fill preload sizes="125vw" className="origin-left object-cover object-[50%_62%] md:scale-125" />
        <div className="absolute inset-0 bg-white/75 md:bg-transparent md:bg-linear-to-r md:from-white md:from-25% md:via-white/75 md:via-40% md:to-transparent md:to-60%" />
        <div className="relative mx-auto w-full max-w-[1200px] px-5 py-16 md:px-8 md:py-20">
          <div className="max-w-[540px]">
            <h1 className="text-[40px] leading-[1.08] font-extrabold tracking-[-0.025em] text-ink md:text-[56px]">
              Unlock global opportunities for Kenya&apos;s pensions.
            </h1>
            <p className="mt-5 max-w-[460px] text-[16px] leading-relaxed text-body">
              PensionBridge helps institutional investors evaluate tokenized products, manage approvals, and verify records on Stellar.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href={wallet ? "/marketplace" : "/connect"} className={buttonClass("primary", "lg")}>Get Started</Link>
              <Link href="/how-it-works" className={buttonClass("secondary", "lg")}>Learn More</Link>
            </div>
          </div>
        </div>
        <a href="https://unsplash.com/photos/a-view-of-a-city-with-tall-buildings-vyagy6HJpVE" target="_blank" rel="noreferrer" className="absolute right-3 bottom-2 hidden text-[10px] text-white/80 drop-shadow md:block">
          Photo: Kenny Murgor / Unsplash
        </a>
      </section>

      <section className="relative border-t border-line bg-white">
        <div className="mx-auto grid max-w-[1200px] grid-cols-2 gap-6 px-5 py-7 md:grid-cols-4 md:px-8">
          {FEATURES.map((f) => (
            <div key={f.label} className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-white shadow-[0_6px_14px_-6px_rgba(74,43,176,0.7)]">
                <f.icon className="h-[18px] w-[18px]" />
              </span>
              <span className="max-w-[150px] text-[13.5px] leading-snug font-medium text-ink">{f.label}</span>
            </div>
          ))}
        </div>
      </section>

    </div>
  );
}
