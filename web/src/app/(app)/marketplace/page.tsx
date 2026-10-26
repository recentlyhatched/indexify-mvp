import { Info } from "lucide-react";
import { q } from "@/lib/server/db";
import { evaluate } from "@/lib/server/evidence";
import { currentUser } from "@/lib/server/session";
import { REVIEW_STATUS_LABEL } from "@/lib/requirements";
import { PageHeader } from "@/components/ui";
import { MarketplaceGrid, type MarketProduct } from "@/components/MarketplaceGrid";

type Row = { id: string; name: string; issuer: string; issuer_short: string | null; ticker: string | null; asset_class: string | null; tags: string[]; underlying_exposure: string; is_illustrative: boolean; listed_by: string | null };

export default async function Marketplace() {
  const user = await currentUser();
  const rows = await q<Row>(
    `select p.id, p.name, p.issuer, p.issuer_short, p.ticker, p.asset_class, p.tags, p.underlying_exposure, p.is_illustrative, i.name as listed_by
       from products p left join institutions i on i.id = p.provider_institution_id order by p.is_illustrative, p.name`,
  );
  const products: MarketProduct[] = [];
  for (const p of rows) {
    const status = user && user.role !== "provider" && !p.is_illustrative ? (await evaluate(user.institution_id, p.id)).status : null;
    products.push({
      id: p.id,
      name: p.name,
      ticker: p.ticker,
      issuer_short: p.issuer_short ?? p.issuer,
      asset_class: p.asset_class ?? "—",
      tags: p.tags,
      summary: p.is_illustrative ? "Fictional listing that shows how alternative products would appear." : `Exposure to ${p.underlying_exposure.charAt(0).toLowerCase()}${p.underlying_exposure.slice(1)} through a tokenized fund structure.`,
      listed_by: (p.listed_by ?? "—").replace(" (demo provider)", ""),
      is_illustrative: p.is_illustrative,
      status,
      status_label: status ? REVIEW_STATUS_LABEL[status] : null,
    });
  }

  return (
    <>
      <PageHeader
        title="Investment Marketplace"
        actions={
          <span title="Research references only. Listings are not offers and nothing here is executable." className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-white">
            <Info className="h-5 w-5" />
          </span>
        }
      >
        Explore tokenized investment products under institutional review. Listings are research references, not offers.
      </PageHeader>
      <MarketplaceGrid products={products} />
    </>
  );
}
