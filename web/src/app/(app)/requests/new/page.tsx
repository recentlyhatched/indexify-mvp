import { q } from "@/lib/server/db";
import { currentUser } from "@/lib/server/session";
import { Notice, PageHeader } from "@/components/ui";
import { RequestWizard } from "@/components/RequestWizard";

export default async function NewRequest({ searchParams }: { searchParams: Promise<{ product?: string }> }) {
  const user = await currentUser();
  const { product } = await searchParams;
  if (user?.role !== "fund_manager") {
    return (
      <>
        <PageHeader title="Submit Investment Request" />
        <Notice tone="blue">Only the institution&apos;s fund manager can submit investment requests.</Notice>
      </>
    );
  }
  const products = await q<{ id: string; name: string; ticker: string | null }>(`select id, name, ticker from products where not is_illustrative order by name`);
  return (
    <>
      <PageHeader title="Submit Investment Request" />
      <RequestWizard products={products} defaultProductId={products.some((p) => p.id === product) ? product : products[0]?.id} />
    </>
  );
}
