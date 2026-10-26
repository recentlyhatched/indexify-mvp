import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft } from "lucide-react";
import { txLink } from "@/lib/config";
import { CopyButton } from "./CopyButton";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

export function PageHeader({ title, children, actions, back }: { title: ReactNode; children?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <header className="mb-6">
      {back && (
        <Link href={back.href} className="mb-3 inline-flex items-center gap-1 text-[13px] text-muted transition hover:text-ink">
          <ChevronLeft className="h-4 w-4" /> {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h1 className="text-[22px] font-bold tracking-[-0.01em] text-ink md:text-[24px]">{title}</h1>
          {children && <div className="mt-1 max-w-3xl text-[13.5px] leading-relaxed text-muted">{children}</div>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function Card({ title, subtitle, children, className, right, bodyClassName }: { title?: ReactNode; subtitle?: ReactNode; children: ReactNode; className?: string; right?: ReactNode; bodyClassName?: string }) {
  const head = Boolean(title || right);
  return (
    <section className={cx("rounded-xl border border-line bg-white shadow-[0_1px_3px_rgba(23,20,44,0.04)]", className)}>
      {head && (
        <header className="flex items-start justify-between gap-4 px-5 pt-5">
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-semibold text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-[12.5px] text-muted">{subtitle}</p>}
          </div>
          {right}
        </header>
      )}
      <div className={cx("@container p-5", head && "pt-4", bodyClassName)}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, icon, tone = "primary" }: { label: string; value: ReactNode; icon?: ReactNode; tone?: "primary" | "success" | "warning" | "danger" }) {
  const t = { primary: "text-primary", success: "text-success-500", warning: "text-warning-500", danger: "text-danger" }[tone];
  return (
    <div className="rounded-xl border border-line bg-white p-4 shadow-[0_1px_3px_rgba(23,20,44,0.04)]">
      <div className="flex items-center gap-2 text-[12.5px] text-muted">
        {icon && <span className={cx("[&>svg]:h-4 [&>svg]:w-4", t)}>{icon}</span>}
        {label}
      </div>
      <div className="mt-2 text-[24px] font-bold text-ink">{value}</div>
    </div>
  );
}

const TONES = {
  neutral: "bg-[#f1f0f5] text-muted",
  success: "bg-success-50 text-success",
  warning: "bg-warning-50 text-warning",
  danger: "bg-danger-50 text-danger",
  info: "bg-info-50 text-info",
  primary: "bg-primary-50 text-primary",
  // legacy aliases
  green: "bg-success-50 text-success",
  amber: "bg-warning-50 text-warning",
  red: "bg-danger-50 text-danger",
  blue: "bg-info-50 text-info",
  violet: "bg-primary-50 text-primary",
  gold: "bg-success-50 text-success",
} as const;
export type Tone = keyof typeof TONES;

export function Badge({ tone = "neutral", children, dot }: { tone?: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11.5px] font-medium whitespace-nowrap", TONES[tone])}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export const STATUS_TONE: Record<string, Tone> = {
  missing: "danger",
  submitted: "info",
  reviewed: "success",
  exception: "danger",
  active: "success",
  revoked: "danger",
  expired: "warning",
  not_anchored: "warning",
  anchoring_pending: "warning",
  retry_required: "danger",
  evidence_complete: "success",
  needs_legal_review: "warning",
  not_cleared: "danger",
  draft: "neutral",
  compliance_review: "warning",
  committee_review: "primary",
  approved: "success",
  rejected: "danger",
  blockchain_verified: "success",
  confirmed: "success",
  failed: "danger",
  unknown: "warning",
  prepared: "neutral",
  superseded: "neutral",
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const text = label ?? status.replace(/_/g, " ");
  return <Badge tone={STATUS_TONE[status] ?? "neutral"}>{text.charAt(0).toUpperCase() + text.slice(1)}</Badge>;
}

export function Confidence({ level }: { level?: string }) {
  if (level === "verified") return <Badge tone="success">Verified source</Badge>;
  if (level === "illustrative") return <Badge tone="primary">Illustrative</Badge>;
  return <Badge tone="warning">Unverified</Badge>;
}

export function Hash({ value, href, chars = 10 }: { value: string | null | undefined; href?: string; chars?: number }) {
  if (!value) return <span className="text-faint">—</span>;
  const short = value.length > chars * 2 + 1 ? `${value.slice(0, chars)}…${value.slice(-6)}` : value;
  return (
    <span className="inline-flex items-center gap-1">
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" className="hash font-medium text-primary hover:underline" title={value}>
          {short}
        </a>
      ) : (
        <span className="hash text-body" title={value}>
          {short}
        </span>
      )}
      <CopyButton value={value} />
    </span>
  );
}

export function TxHash({ hash }: { hash: string | null | undefined }) {
  return <Hash value={hash} href={hash ? txLink(hash) : undefined} />;
}

/** Label/value row, as in the record and product detail tables. */
export function Field({ label, children, confidence }: { label: string; children: ReactNode; confidence?: string }) {
  return (
    <div className="grid gap-1 py-2.5 @md:grid-cols-[170px_1fr] @md:gap-4">
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className="text-[13px] leading-relaxed text-ink">
        {children}
        {confidence && <span className="ml-2 align-middle">{<Confidence level={confidence} />}</span>}
      </dd>
    </div>
  );
}

export function Notice({ tone = "amber", title, children }: { tone?: "amber" | "blue" | "red" | "green"; title?: string; children: ReactNode }) {
  const t = {
    amber: "border-warning-500/30 bg-warning-50 text-[#7a4a06]",
    blue: "border-primary-100 bg-primary-50 text-[#33207a]",
    red: "border-danger/25 bg-danger-50 text-danger",
    green: "border-success-500/30 bg-success-50 text-success",
  }[tone];
  return (
    <div className={cx("rounded-xl border px-4 py-3 text-[13px] leading-relaxed", t)}>
      {title && <div className="mb-0.5 font-semibold">{title}</div>}
      {children}
    </div>
  );
}

export function ButtonLink({ href, children, variant = "primary" }: { href: string; children: ReactNode; variant?: "primary" | "secondary" | "outline" }) {
  return (
    <Link href={href} className={buttonClass(variant)}>
      {children}
    </Link>
  );
}

export function buttonClass(variant: "primary" | "secondary" | "outline" | "danger" | "ghost" = "primary", size: "md" | "sm" | "lg" = "md") {
  return cx(
    "inline-flex items-center justify-center gap-2 rounded-lg font-semibold whitespace-nowrap transition focus-visible:ring-4 focus-visible:ring-primary/20 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
    size === "md" && "h-10 px-4 text-[13.5px]",
    size === "sm" && "h-8 px-3 text-[12.5px]",
    size === "lg" && "h-12 px-6 text-[15px]",
    variant === "primary" && "bg-primary text-white shadow-[0_6px_16px_-6px_rgba(74,43,176,0.6)] hover:bg-primary-600",
    variant === "secondary" && "border border-line bg-white text-ink shadow-[0_1px_2px_rgba(23,20,44,0.05)] hover:bg-paper",
    variant === "outline" && "border border-primary/40 bg-white text-primary hover:bg-primary-50",
    variant === "danger" && "border border-danger/30 bg-white text-danger hover:bg-danger-50",
    variant === "ghost" && "text-muted hover:bg-paper hover:text-ink",
  );
}

export const inputClass =
  "w-full rounded-lg border border-line bg-white px-3 py-2.5 text-[13.5px] text-ink placeholder:text-faint outline-none transition focus:border-primary/60 focus:ring-4 focus:ring-primary/10";
export const fileInputClass = cx(
  inputClass,
  "py-2 text-[13px] text-muted file:mr-3 file:h-7 file:cursor-pointer file:rounded-md file:border-0 file:bg-primary-50 file:px-3 file:text-[12px] file:font-semibold file:text-primary",
);
export const labelClass = "mb-1.5 block text-[12.5px] font-medium text-ink";

export function Tabs({ items, active }: { items: { key: string; label: string; href: string }[]; active: string }) {
  return (
    <nav className="mb-5 flex gap-6 overflow-x-auto border-b border-line [scrollbar-width:none]">
      {items.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          scroll={false}
          className={cx(
            "-mb-px shrink-0 border-b-2 pb-3 text-[13.5px] font-medium transition",
            t.key === active ? "border-primary text-primary" : "border-transparent text-muted hover:text-ink",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-line px-4 py-10 text-center text-[13px] text-muted">{children}</div>;
}

/** Issuer monogram tile, used where a brand logo would sit. */
export function Monogram({ name, size = 36 }: { name: string; size?: number }) {
  const initials = name
    .replace(/[^A-Za-z ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
  return (
    <span className="grid shrink-0 place-items-center rounded-lg bg-primary-50 font-bold text-primary ring-1 ring-primary-100" style={{ width: size, height: size, fontSize: size * 0.36 }}>
      {initials}
    </span>
  );
}

export function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

export function fmtDay(d: Date | string | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function fmtAmount(amount: string, currency: string) {
  const [w, f] = amount.split(".");
  return `${currency} ${w.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${f}`;
}

export function shortWallet(w: string | null | undefined) {
  return w ? `${w.slice(0, 4)}…${w.slice(-4)}` : "—";
}
