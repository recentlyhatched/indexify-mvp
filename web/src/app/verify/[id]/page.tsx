import { sessionWallet } from "@/lib/server/session";
import { VerifyPage } from "@/components/VerifyPage";

export default async function VerifyRecord({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <VerifyPage signedIn={!!(await sessionWallet())} initialId={id} />;
}
