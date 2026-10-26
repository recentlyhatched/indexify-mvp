import { Plus } from "lucide-react";
import { q } from "@/lib/server/db";
import { currentUser } from "@/lib/server/session";
import { requestSummaries } from "@/lib/server/reports";
import { ButtonLink, Card, Notice, PageHeader } from "@/components/ui";
import { RequestTable } from "@/components/RequestTable";

export default async function MyInvestments() {
  const user = await currentUser();
  if (!user || user.role === "provider") {
    return (
      <>
        <PageHeader title="My Investments" />
        <Notice tone="blue">Investment requests are internal to the pension institution. Connect as the fund manager, compliance reviewer or committee member.</Notice>
      </>
    );
  }
  const rows = await requestSummaries(user.institution_id);
  const tickers = new Map((await q<{ id: string; ticker: string | null }>(`select id, ticker from products`)).map((p) => [p.id, p.ticker]));

  return (
    <>
      <PageHeader
        title="My Investments"
        actions={user.role === "fund_manager" && (
          <ButtonLink href="/requests/new">
            <Plus className="h-4 w-4" /> Submit Investment Request
          </ButtonLink>
        )}
      >
        Hypothetical investment requests for {user.institution_name}. No order, transfer or settlement is ever created.
      </PageHeader>
      <Card>
        <RequestTable rows={rows.map((r) => ({ ...r, ticker: tickers.get(r.product_id) }))} empty="No investment requests yet. The fund manager submits one from a product page." />
      </Card>
    </>
  );
}
