# PensionBridge Africa — HackMeridian MVP

An institutional investment-review platform for Kenyan pension schemes. Providers register documents and issue attestations, the scheme runs a sequential compliance → committee workflow, the final approval is frozen as a canonical record and anchored on **Stellar Testnet**, and anyone can verify the record's integrity. Confidential data stays off-chain.

**Live demo:** https://pensionbridge-africa.vercel.app. Hosted on Vercel + Neon Postgres. Public verification needs no wallet; the other roles sign in with the demo wallets below via Freighter.

> Testnet prototype. All investment activity is hypothetical. Blockchain verification proves record integrity only. It is not compliance clearance or a legal determination of eligibility.

```
contracts/pensionbridge   Rust/Soroban registry contract (attestations, revocation, approvals)
web/                      Next.js 16 + TypeScript + Tailwind app, Postgres, Freighter
scripts/                  On-chain role grants
docker-compose.yml        Local Postgres (port 5442)
```

## Deployed contract

| | |
|---|---|
| Network | Stellar Testnet |
| Contract | `CCZMYMCF5DUSV37J3TGXSLUUG7UAV6ZSL5PJI4TVAISJQUK3TXJHUXFU` ([explorer](https://stellar.expert/explorer/testnet/contract/CCZMYMCF5DUSV37J3TGXSLUUG7UAV6ZSL5PJI4TVAISJQUK3TXJHUXFU)) |
| Admin (stellar CLI alias) | `pb-admin` |

Demo role wallets (funded Testnet accounts, with on-chain permissions already granted):

| Role | CLI alias | Public key |
|---|---|---|
| Asset provider | `pb-provider` | `GD72CVZGWJOFW7Q5CTETD7X3WG7G6DIMVBHJLF5KVMGHY4BDEHPPASEO` |
| Fund manager | `pb-fundmgr` | `GBWP7NA2OHXQJDBFPSDB4KFSUTZ7CJSLKWGCPTGQZP7FFCHQDA6XKEJY` |
| Compliance reviewer | `pb-reviewer` | `GAGYXHI7SEPITYE5NKJVIUAID3TH3FTFCIK4NP54JG4ZZ6EYVKXQU2IE` |
| Investment committee | `pb-committee` | `GD4VJVJF4RP54AAKXCGXM5TDCJCZGXHHAMAMXYTMC3TYOKHHBK3D2IGO` |

To import one into Freighter, print its Testnet secret with `stellar keys show pb-provider` (and so on) and use Freighter's **Import wallet → secret key** with Freighter set to **Testnet**. These are Testnet-only keys; never reuse them anywhere else.

## Run locally

```bash
docker compose up -d                 # Postgres on localhost:5442
cd web
cp .env.example .env.local           # then set SESSION_SECRET=$(openssl rand -hex 32)
npm install
npm run db:seed                      # schema + demo institutions, roles, SPXUX reference, sample PDFs
npm run dev                          # http://localhost:3000
```

`npm run db:reset` wipes local demo data and reseeds it. Sample upload files are written to `web/samples/`.

### Using your own wallets

```bash
cd web
npm run db:assign -- G...YOURKEY committee_member "Your Name"
CONTRACT_ID=CCZMYMCF5DUSV37J3TGXSLUUG7UAV6ZSL5PJI4TVAISJQUK3TXJHUXFU ../scripts/grant-onchain-role.sh committee G...YOURKEY
```

Off-chain roles live in the database and are enforced by the server. On-chain permissions (`provider`, `reviewer`, `committee`) are enforced by the contract. A wallet needs both. Fund the account with Friendbot first.

## Demo script (≈5 minutes)

For a full role-by-role walkthrough (Freighter setup, switching accounts, expected results and troubleshooting), see **[DEMO-GUIDE.md](DEMO-GUIDE.md)**.

Sign in at `/connect` with Freighter. The demo-role list there shows each role's public key and the `stellar keys show` command for its Testnet secret.

1. **Provider** (`pb-provider`): Marketplace → WisdomTree 500 Digital Fund → **Documentation**. Register `samples/spxux-prospectus-summary-v1.pdf` as the prospectus. On **Attestations**, issue a provider declaration for *Legal structure* on it, and one for *Documentation pack* on the fact sheet. Approve each in Freighter.
2. **Compliance reviewer** (`pb-reviewer`): on the same product, issue an independent review attestation for *Kenyan pension eligibility*. On **Eligibility Checker**, use **Update item** to mark each requirement **Reviewed**.
3. **Fund manager** (`pb-fundmgr`): click **Request Investment** on the product (or My Investments → **Submit Investment Request**). Go through Details → Review → Submit with a hypothetical KES amount, a rationale and any supporting documents.
4. **Compliance reviewer**: open **Approvals** → the request. Record compliance clearance in the timeline; this re-checks revocation on-chain.
5. **Committee** (`pb-committee`): approve, then **Sign & anchor on Stellar**. Tick *fault injection* the first time to show an uncertain outcome. Then **Reconcile & retry**: it finds the earlier transaction, and no duplicate is sent. The page then switches to **Investment Approved**, with the on-chain record (ledger, timestamp, tx).
6. **Anyone** (no wallet): download the approval document, open **Verify a Record** (`/verify`), and paste the record ID. Use *Check a copy of the record for tampering* and paste the file to get **MATCH**. Change the amount to get **MISMATCH**. The **Upload Document** tab checks an original file against its attestation.
7. **Provider**: revoke the legal-structure declaration. The checklist raises an exception, a new request cannot clear, the earlier approval still verifies, and the revoked attestation stays visible.
8. **Reports** (`/dashboard`): KPI cards plus Investments / Attestations / Compliance Exceptions tabs, and **Download Report**. Uploading `spxux-prospectus-summary-v2.pdf` creates v2 and flags older reviews as mismatched.

## Tests

```bash
cd contracts && cargo test           # contract invariants (uniqueness, issuer auth, revocation, expiry, supersession)
cd web && npm test                   # canonicalization + amount normalization
cd web && E2E_PROVIDER_SECRET=$(stellar keys show pb-provider) \
  E2E_FUND_MANAGER_SECRET=$(stellar keys show pb-fundmgr) \
  E2E_REVIEWER_SECRET=$(stellar keys show pb-reviewer) \
  E2E_COMMITTEE_SECRET=$(stellar keys show pb-committee) \
  BASE_URL=http://localhost:3000 npm run e2e     # full acceptance run on real Testnet
```

The e2e run covers all 10 acceptance tests in the PRD, plus the extra unauthorized-wallet, versioning and replay checks. Run it against a freshly reset DB (`npm run db:reset`).

## How it works

- **Sign-in**: the server issues a never-submittable challenge transaction (sequence 0, one-time nonce, 5-minute bounds). Freighter signs it, and the server verifies the signature and sets an HTTP-only session. Roles always come from the database, never from the browser.
- **Canonicalization (`pbc/1`)** in `web/src/lib/canonical.ts`: strict zod schema, sorted keys (JCS order), NFC strings, integers only, amounts as fixed 2-dp strings, UTC ISO-8601 with milliseconds, explicit `null`s, then SHA-256 over the UTF-8 bytes. The schema and canonicalization versions are part of the hashed content. The exact canonical bytes are stored immutably.
- **Documents** are hashed over their exact bytes, versioned (never overwritten), and kept in private storage (`document_blobs`) behind access-controlled routes.
- **Contract writes** (`web/src/lib/server/anchoring.ts`): the server builds and simulates the call from stored state, and the browser only signs it. Before any retry, previous attempts are reconciled with `getTransaction` and the contract's own state, using one stable record ID per record. Outcomes are `confirmed`, `failed` (retry required) or `unknown` (reconcile first), and none of these is ever shown as a false success.
- **Evidence evaluation** (`web/src/lib/server/evidence.ts`): reliance requires a trusted issuer, the matching document hash, the right scope, no expiry and no revocation. At clearance and approval, revocation is confirmed against the contract, and an unreachable network blocks progression.
- **Public verification** hashes in the browser and returns an explicit allowlist of fields. The result is `MATCH`, `MISMATCH`, `NOT_FOUND` or `UNAVAILABLE`.

## Deploying on a free tier

- **Database**: Supabase (or any Postgres). Use the connection string as `DATABASE_URL`, set `DATABASE_SSL=true` (verified TLS; use `no-verify` only for a pooler with a private CA), and run `npm run db:seed` once against it.
- **App**: Vercel with root directory `web/`. Set every variable from `.env.example`. `SESSION_SECRET`, `DATABASE_URL` and `READ_SOURCE_ACCOUNT` are server-only.
- The app refuses to start with any network other than `testnet`.

## Known limits (pilot-readiness, out of MVP scope)

Wallet control is not institutional authority, and roles are seeded manually. The contract is unaudited. Document storage is Postgres `bytea` with a 4 MB limit. SPXUX is a research reference only: its exposure, custody and Kenyan eligibility fields are labelled *Unverified*, and the sample PDFs are illustrative, not official WisdomTree documents.
