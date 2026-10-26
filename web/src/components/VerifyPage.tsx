import { SiteHeader } from "./SiteHeader";
import { Verifier } from "./Verifier";

export function VerifyPage({ signedIn, initialId }: { signedIn: boolean; initialId?: string }) {
  return (
    <div className="min-h-screen bg-paper">
      <SiteHeader signedIn={signedIn} variant="verify" />
      <main className="mx-auto max-w-[760px] px-4 py-10 md:py-14">
        <div className="rounded-2xl border border-line bg-white p-6 shadow-[0_10px_40px_-20px_rgba(23,20,44,0.2)] md:p-8">
          <h1 className="text-[24px] font-bold tracking-[-0.01em] text-ink">Verify an Investment Record</h1>
          <p className="mt-1 mb-6 text-[13.5px] text-muted">Enter a record ID or upload a document to verify its integrity on Stellar. No wallet required.</p>
          <Verifier initialId={initialId} />
        </div>
      </main>
    </div>
  );
}
