"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Filter, Search } from "lucide-react";
import { Badge, buttonClass, cx, inputClass, Monogram, StatusBadge } from "./ui";

export type MarketProduct = {
  id: string;
  name: string;
  ticker: string | null;
  issuer_short: string;
  asset_class: string;
  tags: string[];
  summary: string;
  listed_by: string;
  is_illustrative: boolean;
  status: string | null;
  status_label: string | null;
};

export function MarketplaceGrid({ products }: { products: MarketProduct[] }) {
  const [term, setTerm] = useState("");
  const [filter, setFilter] = useState<"all" | "reference" | "illustrative">("all");
  const shown = useMemo(() => {
    const t = term.trim().toLowerCase();
    return products.filter(
      (p) =>
        (filter === "all" || (filter === "illustrative") === p.is_illustrative) &&
        (!t || [p.name, p.ticker, p.issuer_short, p.asset_class, ...p.tags].some((v) => v?.toLowerCase().includes(t))),
    );
  }, [products, term, filter]);

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-faint" />
          <input className={cx(inputClass, "pl-9")} placeholder="Search products..." value={term} onChange={(e) => setTerm(e.target.value)} />
        </label>
        <label className="relative">
          <Filter className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" />
          <select className={cx(inputClass, "appearance-none pr-9 pl-9 font-medium sm:w-48")} value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label="Filter">
            <option value="all">Filter: all</option>
            <option value="reference">Research references</option>
            <option value="illustrative">Illustrative</option>
          </select>
        </label>
      </div>

      {shown.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-white px-4 py-12 text-center text-[13px] text-muted">No products match your search.</div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((p) => (
            <article key={p.id} className="flex flex-col rounded-xl border border-line bg-white p-5 shadow-[0_1px_3px_rgba(23,20,44,0.04)] transition hover:shadow-[0_12px_30px_-14px_rgba(23,20,44,0.25)]">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <Monogram name={p.issuer_short} size={30} />
                  <span className="text-[12.5px] font-medium text-body">{p.issuer_short}</span>
                </div>
                {p.status && <StatusBadge status={p.status} label={p.status_label ?? undefined} />}
              </div>
              <h2 className="mt-4 text-[15px] leading-snug font-bold text-ink">
                {p.name}
                {p.ticker && <span> ({p.ticker})</span>}
              </h2>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {p.tags.map((t) => <Badge key={t} tone={t === "Illustrative" ? "warning" : "primary"}>{t}</Badge>)}
              </div>
              <p className="mt-3 text-[13px] leading-relaxed text-muted">{p.summary}</p>
              <dl className="mt-4 space-y-2 border-t border-line pt-4 text-[12.5px]">
                {[
                  ["Issuer", p.issuer_short],
                  ["Ticker", p.ticker ?? "—"],
                  ["Asset Class", p.asset_class],
                  ["Listed by", p.listed_by],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3">
                    <dt className="text-muted">{k}</dt>
                    <dd className="truncate text-right font-medium text-ink">{v}</dd>
                  </div>
                ))}
              </dl>
              <Link href={`/products/${p.id}`} className={cx(buttonClass("primary"), "mt-5 w-full")}>View Details</Link>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
