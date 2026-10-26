/**
 * Applies the schema and seeds demo institutions, role wallets and the reference product.
 * Roles are assigned manually to known Testnet wallets — this is NOT a production identity system.
 *
 *   npm run db:seed
 *   npm run db:reset   (drops local demo data, then seeds)
 *   npm run db:assign -- <G... wallet> <provider|fund_manager|compliance_reviewer|committee_member> "Display name"
 *   npm run db:unassign -- <G... wallet>   (deactivates the user and removes issuer trust)
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { Client } from "pg";
import { makePdf } from "./pdf";

const ROOT = join(__dirname, "..");
const INST = {
  scheme: "11111111-1111-4111-8111-111111111111",
  provider: "22222222-2222-4222-8222-222222222222",
};

const ROLE_INSTITUTION: Record<string, string> = {
  provider: INST.provider,
  fund_manager: INST.scheme,
  compliance_reviewer: INST.scheme,
  committee_member: INST.scheme,
};

async function assign(c: Client, wallet: string, role: string, name: string) {
  if (!/^G[A-Z2-7]{55}$/.test(wallet)) throw new Error(`Invalid wallet ${wallet}`);
  if (!ROLE_INSTITUTION[role]) throw new Error(`Unknown role ${role}`);
  await c.query(
    `insert into users (wallet_address, institution_id, role, display_name) values ($1,$2,$3,$4)
     on conflict (wallet_address) do update set institution_id = excluded.institution_id, role = excluded.role, display_name = excluded.display_name, is_active = true`,
    [wallet, ROLE_INSTITUTION[role], role, name],
  );
  const trustType = role === "provider" ? "provider_declaration" : role === "compliance_reviewer" ? "independent_review" : null;
  if (trustType) {
    await c.query(`insert into trusted_issuers values ($1,$2,$3) on conflict do nothing`, [INST.scheme, wallet, trustType]);
  }
  console.log(`  ${role.padEnd(20)} ${wallet}  ${name}`);
}

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined });
  await c.connect();
  const [cmd, ...args] = process.argv.slice(2);

  if (cmd === "unassign") {
    const [wallet] = args;
    if (!/^G[A-Z2-7]{55}$/.test(wallet ?? "")) throw new Error(`Invalid wallet ${wallet}`);
    const r = await c.query(`update users set is_active = false where wallet_address = $1`, [wallet]);
    await c.query(`delete from trusted_issuers where issuer_wallet = $1`, [wallet]);
    console.log(r.rowCount ? `  deactivated ${wallet}` : `  ${wallet} was not a user`);
    await c.end();
    return;
  }
  if (cmd === "assign") {
    const [wallet, role, ...name] = args;
    await assign(c, wallet, role, name.join(" ") || role);
    if (role !== "fund_manager") {
      console.log(`\nAlso grant the on-chain permission:\n  CONTRACT_ID=$NEXT_PUBLIC_CONTRACT_ID ../scripts/grant-onchain-role.sh ${role === "compliance_reviewer" ? "reviewer" : role === "committee_member" ? "committee" : "provider"} ${wallet}`);
    }
    await c.end();
    return;
  }

  if (cmd === "reset") {
    if (process.env.NODE_ENV === "production") throw new Error("Refusing to reset in production");
    console.log("Dropping all PensionBridge tables (local demo reset)…");
    await c.query(`drop table if exists request_attachments, auth_nonces, public_records, chain_transactions, audit_events, approval_records, investment_requests,
      attestations, eligibility_items, eligibility_reviews, document_blobs, documents, products, trusted_issuers, users, institutions cascade`);
  }

  console.log("Applying schema…");
  await c.query(readFileSync(join(ROOT, "db/schema.sql"), "utf8"));

  await c.query(
    `insert into institutions (id, name, country, institution_type) values
       ($1, 'Harambee Staff Retirement Scheme (demo)', 'KE', 'occupational_pension_scheme'),
       ($2, 'Meridian Digital Assets Ltd (demo provider)', 'KE', 'asset_provider')
     on conflict (id) do nothing`,
    [INST.scheme, INST.provider],
  );

  console.log("Assigning demo roles:");
  const wallets: [string, string, string][] = [
    [process.env.DEMO_PROVIDER_WALLET ?? "", "provider", "Amina Wanjiru · Provider desk"],
    [process.env.DEMO_FUND_MANAGER_WALLET ?? "", "fund_manager", "Daniel Otieno · Fund manager"],
    [process.env.DEMO_REVIEWER_WALLET ?? "", "compliance_reviewer", "Grace Mwangi · Compliance"],
    [process.env.DEMO_COMMITTEE_WALLET ?? "", "committee_member", "Joseph Kamau · Investment committee"],
  ];
  for (const [w, role, name] of wallets) {
    if (w) await assign(c, w, role, name);
    else console.log(`  (skipped ${role}: set DEMO_${role.toUpperCase()}_WALLET)`);
  }

  await c.query(
    `insert into products (id, name, issuer, ticker, underlying_exposure, legal_structure, custody_summary, eligibility_notes, source_urls, data_confidence, is_illustrative, provider_institution_id)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false,$11)
     on conflict (id) do update set name = excluded.name, issuer = excluded.issuer, ticker = excluded.ticker, underlying_exposure = excluded.underlying_exposure,
       legal_structure = excluded.legal_structure, custody_summary = excluded.custody_summary, eligibility_notes = excluded.eligibility_notes,
       source_urls = excluded.source_urls, data_confidence = excluded.data_confidence`,
    [
      "spxux",
      "WisdomTree 500 Digital Fund",
      "WisdomTree Digital Management, Inc. (adviser), a subsidiary of WisdomTree, Inc.",
      "SPXUX",
      "U.S. large-cap equities (S&P 500-style exposure)",
      "Series of WisdomTree Digital Trust, a Delaware statutory trust registered as an open-end management investment company under the U.S. Investment Company Act of 1940.",
      "Fund share ownership is maintained by the fund's transfer agent. Onchain tokens are digital representations used for recordkeeping and do not independently determine fund ownership. Custodian details not yet confirmed from the prospectus.",
      "No determination has been made that this fund is eligible for, or available to, a Kenyan pension scheme. Distribution permissions, investor eligibility and RBA investment-guideline treatment require independent legal review.",
      JSON.stringify([
        { label: "WisdomTree Onchain — SPXUX", url: "https://www.wisdomtree.com/onchain/tokenized-funds/spxux" },
        { label: "SEC filing — WisdomTree Digital Trust prospectus (Form 497)", url: "https://www.sec.gov/Archives/edgar/data/1859001/000121465923000941/wtpea17_e11823497e.htm" },
      ]),
      JSON.stringify({
        name: "verified",
        issuer: "verified",
        ticker: "verified",
        underlying_exposure: "unverified",
        legal_structure: "verified",
        custody_summary: "unverified",
        eligibility_notes: "unverified",
      }),
      INST.provider,
    ],
  );

  await c.query(
    `insert into products (id, name, issuer, ticker, underlying_exposure, legal_structure, custody_summary, eligibility_notes, source_urls, data_confidence, is_illustrative, provider_institution_id)
     values ('ke-infra-note', 'Kenya Infrastructure Income Note (illustrative)', 'Fictional issuer', 'KIIN-T', 'Shilling-denominated infrastructure project cash flows',
             'Illustrative only — no such product exists.', 'Illustrative only.', 'Illustrative only — shown to demonstrate how alternative products would be listed.',
             '[]', '{"name":"illustrative","issuer":"illustrative","ticker":"illustrative","underlying_exposure":"illustrative","legal_structure":"illustrative","custody_summary":"illustrative","eligibility_notes":"illustrative"}', true, $1)
     on conflict (id) do nothing`,
    [INST.provider],
  );
  await c.query(
    `update products set issuer_short = v.issuer_short, asset_class = v.asset_class, tags = v.tags::jsonb
       from (values ('spxux', 'WisdomTree', 'Equity fund', '["Tokenized fund","U.S. equities"]'),
                    ('ke-infra-note', 'Fictional issuer', 'Infrastructure note', '["Illustrative","Infrastructure"]')) as v(id, issuer_short, asset_class, tags)
      where products.id = v.id`,
  );

  // Seed two illustrative supporting documents so the demo can focus on the prospectus journey.
  const provider = process.env.DEMO_PROVIDER_WALLET ?? "seed";
  const seedDocs: [string, string, string[]][] = [
    ["custody_letter", "Custody & transfer-agent confirmation (ILLUSTRATIVE SAMPLE)", [
      "This is an illustrative sample document generated for the PensionBridge prototype.",
      "It is not issued by WisdomTree or any custodian and has no legal effect.",
      "",
      "Fund: WisdomTree 500 Digital Fund (SPXUX)",
      "Statement: Share ownership is recorded by the fund's transfer agent.",
      "Blockchain tokens are a secondary record and do not determine ownership.",
    ]],
    ["fact_sheet", "Product fact sheet (ILLUSTRATIVE SAMPLE)", [
      "This is an illustrative sample document generated for the PensionBridge prototype.",
      "",
      "Fund: WisdomTree 500 Digital Fund (SPXUX)",
      "Exposure: U.S. large-cap equities (to be verified against official fund materials)",
      "Dealing: to be verified against the prospectus",
    ]],
  ];
  for (const [type, title, lines] of seedDocs) {
    const exists = await c.query(`select 1 from documents where product_id = 'spxux' and document_type = $1`, [type]);
    if (exists.rowCount) continue;
    const bytes = makePdf(title, lines);
    const key = `documents/spxux/${randomUUID()}`;
    await c.query(`insert into document_blobs values ($1,$2)`, [key, bytes]);
    await c.query(
      `insert into documents (product_id, document_type, version, file_name, mime_type, size_bytes, storage_key, sha256_hash, uploaded_by)
       values ('spxux',$1,1,$2,'application/pdf',$3,$4,$5,$6)`,
      [type, `spxux-${type.replace("_", "-")}-sample.pdf`, bytes.length, key, createHash("sha256").update(bytes).digest("hex"), provider],
    );
  }

  // Sample files for the live demo upload (v1 and a changed v2 to show versioning).
  const samples = join(ROOT, "samples");
  mkdirSync(samples, { recursive: true });
  const prospectus = (v: number) =>
    makePdf(`SPXUX prospectus summary v${v} (ILLUSTRATIVE SAMPLE)`, [
      "Illustrative sample for the PensionBridge prototype. Not an official WisdomTree document.",
      "Refer to the SEC-filed prospectus for authoritative information.",
      "",
      "Structure: series of WisdomTree Digital Trust (Delaware statutory trust, 1940 Act).",
      "Ownership: recorded by the transfer agent; tokens do not determine ownership.",
      "Redemption: per prospectus terms (to be confirmed).",
      v > 1 ? "Revision: updated risk disclosures (version 2)." : "",
    ]);
  writeFileSync(join(samples, "spxux-prospectus-summary-v1.pdf"), prospectus(1));
  writeFileSync(join(samples, "spxux-prospectus-summary-v2.pdf"), prospectus(2));
  console.log(`Sample upload files written to ${samples}`);
  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
