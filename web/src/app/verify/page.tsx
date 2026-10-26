import { sessionWallet } from "@/lib/server/session";
import { VerifyPage } from "@/components/VerifyPage";

export default async function Verify() {
  return <VerifyPage signedIn={!!(await sessionWallet())} />;
}
