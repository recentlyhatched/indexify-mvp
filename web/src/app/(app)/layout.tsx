import { Sidebar } from "@/components/Sidebar";
import { currentUser, sessionWallet } from "@/lib/server/session";
import { ROLE_LABEL } from "@/lib/requirements";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [wallet, user] = await Promise.all([sessionWallet(), currentUser()]);
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar wallet={wallet} user={user ? { display_name: user.display_name, role_label: ROLE_LABEL[user.role] } : null} />
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="mx-auto w-full max-w-[1180px] flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
        <footer className="px-4 pb-6 text-[11.5px] text-faint md:px-8">
          Stellar Testnet prototype · all investment activity is hypothetical · blockchain verification proves record integrity, not compliance or legal eligibility.
        </footer>
      </div>
    </div>
  );
}
