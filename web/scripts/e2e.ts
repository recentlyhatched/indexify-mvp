/**
 * End-to-end acceptance run against a running app and the real Testnet contract.
 * Signs with Testnet secret keys in place of Freighter (test-only; the app never sees them).
 *
 *   E2E_PROVIDER_SECRET=$(stellar keys show pb-provider) … npm run e2e
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- loosely-typed test harness */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Keypair, TransactionBuilder } from "@stellar/stellar-sdk";
import { canonicalizeRecord, sha256Hex } from "../src/lib/canonical";
import { REQUIREMENTS } from "../src/lib/requirements";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const PASS = "Test SDF Network ; September 2015";

class Actor {
  cookie = "";
  constructor(public name: string, public kp: Keypair) {}
  async call<T = any>(path: string, body?: unknown, method = body === undefined ? "GET" : "POST"): Promise<{ status: number; data: T; text: string }> {
    const isForm = body instanceof FormData;
    const res = await fetch(BASE + path, {
      method,
      headers: { cookie: this.cookie, ...(isForm || body === undefined ? {} : { "content-type": "application/json" }) },
      body: isForm ? body : body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get("set-cookie");
    if (set) this.cookie = set.split(";")[0];
    const text = await res.text();
    let data: any = null;
    try { data = JSON.parse(text); } catch { /* non-JSON */ }
    return { status: res.status, data, text };
  }
  sign(xdr: string) {
    const tx = TransactionBuilder.fromXDR(xdr, PASS);
    tx.sign(this.kp);
    return tx.toXDR();
  }
  async login() {
    const { data } = await this.call("/api/auth/challenge", { address: this.kp.publicKey() });
    const r = await this.call("/api/auth/verify", { signedXdr: this.sign(data.xdr) });
    expect(r.status === 200 && r.data.authorized, `${this.name} login`, r.text);
  }
  /** prepare result → sign → submit */
  async sign_and_submit(chain: any, simulateTimeout = false) {
    if (chain.state !== "ready") return chain.state;
    const r = await this.call("/api/chain/submit", { chainTxId: chain.chainTxId, signedXdr: this.sign(chain.xdr), simulateTimeout });
    if (r.status !== 200) throw new Error(r.text);
    return r.data.status as string;
  }
}

let failures = 0;
function expect(cond: unknown, label: string, detail?: unknown) {
  console.log(`${cond ? "  ✔" : "  ✘"} ${label}${cond ? "" : `  →  ${typeof detail === "string" ? detail.slice(0, 300) : JSON.stringify(detail)}`}`);
  if (!cond) failures++;
}

function key(env: string) {
  const s = process.env[env];
  if (!s) throw new Error(`${env} not set`);
  return Keypair.fromSecret(s);
}

async function main() {
  const provider = new Actor("provider", key("E2E_PROVIDER_SECRET"));
  const manager = new Actor("fund manager", key("E2E_FUND_MANAGER_SECRET"));
  const reviewer = new Actor("reviewer", key("E2E_REVIEWER_SECRET"));
  const committee = new Actor("committee", key("E2E_COMMITTEE_SECRET"));
  const stranger = new Actor("stranger", Keypair.random());

  console.log("\n1. Wallet sign-in");
  for (const a of [provider, manager, reviewer, committee]) await a.login();
  {
    const { data } = await stranger.call("/api/auth/challenge", { address: stranger.kp.publicKey() });
    const r = await stranger.call("/api/auth/verify", { signedXdr: stranger.sign(data.xdr) });
    expect(r.data.authorized === false, "unassigned wallet signs in but has no role");
    const replay = await stranger.call("/api/auth/verify", { signedXdr: stranger.sign(data.xdr) });
    expect(replay.status === 401, "login challenge cannot be replayed");
  }

  console.log("\n2. Provider registers a document");
  const fd = new FormData();
  const bytes = readFileSync(join(__dirname, "../samples/spxux-prospectus-summary-v1.pdf"));
  fd.set("productId", "spxux");
  fd.set("documentType", "prospectus");
  fd.set("file", new File([bytes], "spxux-prospectus-summary-v1.pdf", { type: "application/pdf" }));
  const up = await provider.call("/api/documents", fd);
  expect(up.status === 200 && up.data.sha256 === (await sha256Hex(new Uint8Array(bytes))), "document hash = SHA-256 of exact bytes", up.text);
  const prospectusId = up.data.id as string;
  const blocked = await manager.call("/api/documents", fd);
  expect(blocked.status === 403, "fund manager cannot upload documents");

  console.log("\n3. Attestations registered on Soroban");
  const issue = async (a: Actor, body: Record<string, unknown>) => {
    const r = await a.call("/api/attestations", body);
    if (r.status !== 200) return { status: r.status, text: r.text, recordId: null as string | null, outcome: "http-error" };
    return { status: 200, text: r.text, recordId: r.data.recordId as string, outcome: await a.sign_and_submit(r.data.chain) };
  };
  const decl = await issue(provider, { productId: "spxux", documentId: prospectusId, type: "provider_declaration", scope: "legal_structure", claim: "Documentation accurately describes legal structure and investor rights.", expiresInMinutes: 43200 });
  expect(decl.outcome === "confirmed", "provider declaration confirmed on-chain", decl.text);

  const review = await issue(reviewer, { productId: "spxux", documentId: prospectusId, type: "independent_review", scope: "kenyan_pension_eligibility", claim: "Independent review performed against the eligibility checklist. Not a legal approval.", expiresInMinutes: 43200 });
  expect(review.outcome === "confirmed", "independent review attestation confirmed on-chain", review.text);

  const fake = await issue(provider, { productId: "spxux", documentId: prospectusId, type: "independent_review", scope: "kenyan_pension_eligibility", claim: "Provider pretending to be an independent reviewer.", expiresInMinutes: null });
  expect(fake.status === 403, "provider cannot issue an independent review attestation");
  const fake2 = await issue(manager, { productId: "spxux", documentId: prospectusId, type: "provider_declaration", scope: "legal_structure", claim: "Fund manager is not an issuer at all here.", expiresInMinutes: null });
  expect(fake2.status === 403, "fund manager cannot issue attestations");

  // Fact sheet declaration (documentation requirement)
  const productPage = await provider.call("/products/spxux?tab=documentation");
  const factSheetId = /\/evidence\/([0-9a-f-]{36})/g;
  const ids = [...productPage.text.matchAll(factSheetId)].map((m) => m[1]);
  let factDoc: string | null = null;
  for (const id of ids) {
    const p = await provider.call(`/evidence/${id}`);
    if (p.text.includes("Product fact sheet")) { factDoc = id; break; }
  }
  const decl2 = await issue(provider, { productId: "spxux", documentId: factDoc!, type: "provider_declaration", scope: "product_documentation", claim: "The documentation pack is complete and current.", expiresInMinutes: 43200 });
  expect(decl2.outcome === "confirmed", "documentation declaration confirmed on-chain", decl2.text);

  console.log("\n4. Investment request and sequential review");
  const req = await manager.call("/api/requests", { productId: "spxux", amount: "25,000,000", currency: "KES" });
  expect(req.status === 200, "fund manager submits hypothetical request", req.text);
  const memo = new FormData();
  memo.set("file", new Blob([new TextEncoder().encode("Allocation memo for IC")], { type: "text/plain" }), "allocation-memo.txt");
  const att = await manager.call(`/api/requests/${req.data.id}/attachments`, memo);
  expect(att.status === 200, "fund manager attaches a supporting document", att.text);
  const dl = await committee.call(`/api/requests/${req.data.id}/attachments/${att.data.id}`);
  expect(dl.status === 200 && dl.text === "Allocation memo for IC", "committee downloads the exact attachment bytes");
  const attOther = new FormData();
  attOther.set("file", new Blob(["x"]), "x.txt");
  expect((await provider.call(`/api/requests/${req.data.id}/attachments`, attOther)).status === 403, "provider cannot attach to an institution request");
  const reqId = req.data.id as string;
  const early = await committee.call(`/api/requests/${reqId}/decide`, { decision: "approved", rationale: null });
  expect(early.status === 409, "committee cannot decide before compliance clearance");
  const premature = await reviewer.call(`/api/requests/${reqId}/clear`, { notes: null });
  expect(premature.status === 409, "compliance cannot clear before evidence is reviewed", premature.text);
  const mgrReviewed = await manager.call("/api/eligibility", { productId: "spxux", code: "custody", status: "reviewed", notes: null });
  expect(mgrReviewed.status === 403, "fund manager cannot mark evidence reviewed");
  for (const r of REQUIREMENTS) {
    const u = await reviewer.call("/api/eligibility", { productId: "spxux", code: r.code, status: "reviewed", notes: "Checked against source documents" });
    if (u.status !== 200) expect(false, `review ${r.code}`, u.text);
  }
  const cleared = await reviewer.call(`/api/requests/${reqId}/clear`, { notes: "Evidence complete" });
  expect(cleared.status === 200, "compliance clears after evidence + on-chain attestation check", cleared.text);
  const wrongRole = await manager.call(`/api/requests/${reqId}/decide`, { decision: "approved", rationale: null });
  expect(wrongRole.status === 403, "fund manager cannot approve");
  const approved = await committee.call(`/api/requests/${reqId}/decide`, { decision: "approved", rationale: "Within allocation limits" });
  expect(approved.status === 200, "committee approves", approved.text);
  const recordId = approved.data.recordId as string;

  console.log("\n5. Canonical record + anchoring with an uncertain outcome");
  const rec = await manager.call(`/api/requests/${reqId}/record`);
  const recomputed = await canonicalizeRecord(JSON.parse(rec.text));
  expect(recomputed.hash === approved.data.payloadHash && recomputed.canonical === rec.text, "canonical bytes re-hash to the stored hash");
  const strangerAnchor = await stranger.call(`/api/requests/${reqId}/anchor`, {});
  expect(strangerAnchor.status === 401 || strangerAnchor.status === 403, "unassigned wallet cannot anchor");

  const prep = await committee.call(`/api/requests/${reqId}/anchor`, {});
  const first = await committee.sign_and_submit(prep.data.chain, true);
  expect(first === "unknown", "simulated timeout leaves outcome unknown (not shown as success)", first);
  const midPage = await committee.call(`/requests/${reqId}`);
  expect(!midPage.text.includes(">Blockchain verified<") || midPage.text.includes("Anchoring pending"), "request not marked verified before reconciliation");
  await new Promise((r) => setTimeout(r, 8000));
  const retry = await committee.call(`/api/requests/${reqId}/anchor`, {});
  expect(retry.data.chain?.state === "confirmed", "retry reconciles the earlier tx instead of sending a duplicate", retry.text);
  const page = await committee.call(`/requests/${reqId}`);
  expect(page.text.includes("Blockchain verified"), "request reaches Blockchain verified");

  console.log("\n6. Public verification");
  const v = async (q: string) => (await fetch(`${BASE}/api/public/verify?${q}`)).json();
  const match = await v(`id=${recordId}&hash=${recomputed.hash}`);
  expect(match.result === "MATCH", "original record → MATCH", match);
  expect(!JSON.stringify(match).includes("25000000"), "public response contains no amount");
  const tampered = JSON.parse(rec.text);
  tampered.amount.value = "95000000.00";
  const mismatch = await v(`id=${recordId}&hash=${(await canonicalizeRecord(tampered)).hash}`);
  expect(mismatch.result === "MISMATCH", "modified record → MISMATCH", mismatch);
  const nf = await v(`id=${"0".repeat(63)}1&hash=${recomputed.hash}`);
  expect(nf.result === "NOT_FOUND", "unknown ID → NOT_FOUND", nf);
  const docMatch = await v(`id=${decl.recordId}&hash=${up.data.sha256}&against=document`);
  expect(docMatch.result === "MATCH" && docMatch.status === "active", "original document file → MATCH against attestation", docMatch);

  console.log("\n7. Revocation");
  const otherRevoke = await reviewer.call(`/api/attestations/${decl.recordId}/revoke`, {});
  expect(otherRevoke.status === 403, "only the original issuer can revoke");
  const rv = await provider.call(`/api/attestations/${decl.recordId}/revoke`, {});
  const rvOut = await provider.sign_and_submit(rv.data.chain);
  expect(rvOut === "confirmed", "issuer revokes on-chain", rv.text);
  const afterRevoke = await v(`id=${decl.recordId}`);
  expect(afterRevoke.status === "revoked" && afterRevoke.anchoredHash, "revoked attestation remains historically visible", afterRevoke);
  const req2 = await manager.call("/api/requests", { productId: "spxux", amount: "1000000.00", currency: "KES" });
  const blockedClear = await reviewer.call(`/api/requests/${req2.data.id}/clear`, { notes: null });
  expect(blockedClear.status === 409 && /revoked/i.test(blockedClear.text), "revoked attestation cannot satisfy a required check", blockedClear.text);
  const stillMatch = await v(`id=${recordId}&hash=${recomputed.hash}`);
  expect(stillMatch.result === "MATCH", "earlier approval is not rewritten by the later revocation");

  console.log("\n8. Versioning & reporting");
  const fd2 = new FormData();
  fd2.set("productId", "spxux");
  fd2.set("documentType", "prospectus");
  fd2.set("file", new File([readFileSync(join(__dirname, "../samples/spxux-prospectus-summary-v2.pdf"))], "spxux-prospectus-summary.pdf", { type: "application/pdf" }));
  const up2 = await provider.call("/api/documents", fd2);
  expect(up2.data?.version === 2 && up2.data.sha256 !== up.data.sha256, "changed file becomes v2 with a new hash", up2.text);
  const report = await manager.call("/api/reports/sample");
  expect(report.status === 200 && report.text.includes("Approval history"), "sample report downloads");
  const anon = await new Actor("anon", Keypair.random()).call("/api/reports/sample");
  expect(anon.status === 401, "report requires authorization");

  console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
