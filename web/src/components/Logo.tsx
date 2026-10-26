import { cx } from "./ui";

/** Bridge arch in violet, Kenyan green and gold, spanning a deck. */
export function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size * 0.62} viewBox="0 0 64 40" aria-hidden>
      <path d="M4 34C10 12 22 4 32 4s22 8 28 30" fill="none" stroke="#4a2bb0" strokeWidth="5" strokeLinecap="round" />
      <path d="M11 34c5-14 13-21 21-21s16 7 21 21" fill="none" stroke="#1f8a4c" strokeWidth="4" strokeLinecap="round" />
      <path d="M18 34c3.5-8 8.5-12.5 14-12.5S42.5 26 46 34" fill="none" stroke="#f2b705" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M1 34.5h62" stroke="#17142c" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ size = "md", stacked = false }: { size?: "sm" | "md" | "lg"; stacked?: boolean }) {
  const mark = { sm: 30, md: 38, lg: 64 }[size];
  const word = { sm: "text-[15px]", md: "text-[18px]", lg: "text-[22px]" }[size];
  const sub = { sm: "text-[7px] tracking-[0.55em]", md: "text-[8px] tracking-[0.6em]", lg: "text-[10px] tracking-[0.7em]" }[size];
  return (
    <span className={cx("inline-flex items-center", stacked ? "flex-col gap-1" : "gap-2")}>
      <LogoMark size={mark} />
      <span className={cx("leading-none", stacked && "text-center")}>
        <span className={cx("block font-bold tracking-[-0.02em] text-ink", word)}>PensionBridge</span>
        <span className={cx("mt-1 block font-medium text-muted uppercase", sub)}>Africa</span>
      </span>
    </span>
  );
}
