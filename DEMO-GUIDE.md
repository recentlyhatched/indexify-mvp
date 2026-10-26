# PensionBridge demo guide: who does what

A step-by-step script for running the full demo. Each step says **which account to use**, **where to click**, and **what you should see**.

- Live site: https://pensionbridge-africa.vercel.app
- Everything runs on **Stellar Testnet**. All investments are hypothetical, and the test XLM has no value.

---

## The four demo accounts

Each account is a **different person with exactly one role**. Your role is set by the wallet Freighter signs in with, not by anything you click in the app.

| Key name | Person | Role | What they do in the demo |
|---|---|---|---|
| `pb-provider` | Amina Wanjiru | Asset provider | Uploads product documents, issues provider declarations, can revoke them |
| `pb-fundmgr` | Daniel Otieno | Fund manager | Submits the investment request |
| `pb-reviewer` | Grace Mwangi | Compliance reviewer | Issues the independent review, marks evidence reviewed, clears compliance |
| `pb-committee` | Joseph Kamau | Investment committee | Approves the request and anchors it on Stellar |

The server enforces these roles. A fund manager cannot approve, a provider cannot see internal requests, and so on.

---

## One-time setup (about 5 minutes per computer)

### 1. Install Freighter
1. In Chrome, Brave, Edge or Firefox, install **Freighter** from https://www.freighter.app/. The publisher must be **Stellar Development Foundation**.
2. Pin it to the toolbar: click the 🧩 puzzle icon, then the pin next to Freighter.
3. Open Freighter, choose **Create new wallet**, set a password, and store the recovery phrase.

### 2. Switch Freighter to Test Net
Open Freighter, click **Main Net** at the top, and choose **Test Net**.
The app refuses Main Net on purpose: if you see *"Freighter is on PUBLIC"*, you skipped this step.

### 3. Import the four demo accounts
The secret keys are stored in the Stellar CLI on the computer that set up the project. On that computer, run:

```bash
stellar keys show pb-provider
stellar keys show pb-fundmgr
stellar keys show pb-reviewer
stellar keys show pb-committee
```

Each prints a line starting with `S…`. For each one:

1. Open Freighter and click the account icon at the top-left.
2. Choose **Import a Stellar secret key**, paste the `S…` line, and confirm.
3. Optional but helpful: rename the account in Freighter to the person's name, such as "Daniel – fund manager", so switching is easy.

A correctly imported demo account shows a balance of about **10,000 XLM**. If you see 0 XLM, you're still on the empty wallet you created in step 1.

> **Keep keys private.** These are Testnet-only, but they hold the demo's on-chain roles. Share them with teammates or judges privately, never in the repo or a public channel. Never share `pb-admin`; it controls the contract.

---

## Adding a new tester with their own wallet

Anyone can test with **their own** Freighter wallet and name instead of the demo keys. A brand-new wallet can sign in straight away, but the app gives it no role until you onboard it.

**The tester does:**
1. Installs Freighter and switches to **Test Net** (setup steps 1–2 above).
2. In Freighter, copies their **public key**: the address starting with `G…`, shown under the account name. This is safe to share; **never** share the `S…` secret key.
3. Sends you that `G…` address and the role they want.

**You run (on the computer with the `pb-admin` key, from the project folder):**
```bash
scripts/add-tester.sh <role> <G... address> "Their name"
```
`<role>` is one of `provider`, `fund_manager`, `compliance_reviewer` or `committee_member`. For example:
```bash
scripts/add-tester.sh committee_member GABC...XYZ "Wanjiku N."
```

The command does three things:
1. Funds the wallet with free Testnet XLM if it's new, so Freighter can pay fees.
2. Gives it the role and display name in the app.
3. Grants the matching permission on the Stellar contract. A fund manager doesn't need one.

**The tester then** reloads `/connect` → **Connect with Freighter**. The sidebar shows their own name and role.

- **More than one role:** one wallet holds one role. To try several, the tester creates extra accounts in Freighter (account icon → **Add new account**) and you onboard each one.
- **Taking access away:** run `scripts/add-tester.sh --remove <G... address>`. This deactivates them in the app and withdraws their on-chain permission.
- **Your local copy:** add `--local` to either command to target your local database instead of the live one.

---

## How to switch roles

1. In the app sidebar, click the **log-out icon** next to your name (bottom-left).
2. In Freighter, switch to the next person's account (account icon at the top-left).
3. Go to **/connect**, click **Connect with Freighter**, and approve both pop-ups (connect, then sign).
4. The sidebar now shows the new person's name and role.

The sign-in pop-up asks you to sign a one-time login message. It can't be submitted as a transaction and moves no funds.

---

## Full demo run (about 10 minutes)

> Start from clean data if you want the screens to match this script exactly (see [Reset the demo data](#reset-the-demo-data)). With the current live data, some steps are already done, such as an existing verified request and a revoked declaration.

### Step 1: Asset provider (Amina, `pb-provider`)
1. **Marketplace** → **WisdomTree 500 Digital Fund (SPXUX)** → **View Details**.
2. **Documentation** tab → *Register a document version*: type **Prospectus / offering memorandum**, file `web/samples/spxux-prospectus-summary-v1.pdf` → **Register document version**.
   - *You should see:* the prospectus listed as v1, with its SHA-256 hash.
3. **Attestations** tab → *Issue provider declaration*. Fill in **Document version**, **Review scope**, a short **Claim** (at least 10 characters) and **Expiry**, then click **Sign & register on Stellar** and sign in Freighter. Do this twice:
   - Document **Prospectus v1**, scope **Legal structure & investor rights described accurately**.
   - Document **Product fact sheet**, scope **Documentation pack is complete and current**.
   - *You should see:* both declarations reach **Active**, each with a Stellar transaction link.

### Step 2: Compliance reviewer (Grace, `pb-reviewer`)
1. Open the same product → **Attestations** tab → *Issue independent review*: document **Prospectus v1**, scope **Kenyan pension eligibility review performed**, a short claim → **Sign & register on Stellar** → sign in Freighter.
2. **Eligibility Checker** tab: for each of the 5 items, click **Update item** → **Reviewed** → **Save**.
   - *You should see:* every row turns **Complete**, and Overall Status becomes **Evidence complete**.

### Step 3: Fund manager (Daniel, `pb-fundmgr`)
1. Product page → **Request Investment**, or **My Investments** → **Submit Investment Request**.
2. **Details:** amount (for example KES 25,000,000), a short rationale, optional supporting documents → **Continue**.
3. **Review** → **Continue** → **Submit for compliance review**.
   - *You should see:* the approval workflow page with the request at **Compliance Review**.

### Step 4: Compliance reviewer (Grace, `pb-reviewer`)
1. **Approvals** → the new request (marked *Awaiting you*) → **View Details**.
2. Under **Compliance Review**, add a note and click **Record compliance clearance**. The app re-checks every evidence item and attestation status on Stellar.
   - *You should see:* Compliance Review is ticked, and the request moves to **Committee review**.

### Step 5: Investment committee (Joseph, `pb-committee`)
1. **Approvals** → the request → under **Investment Committee Decision**, click **Approve**.
2. Under **Blockchain Anchoring**:
   - *Optional, to show resilience:* tick **Fault injection (demo)** first, then **Sign & anchor on Stellar**. The app reports the outcome as *unknown* instead of claiming success. Then click **Reconcile & retry anchoring**: it finds the earlier transaction instead of sending a duplicate.
   - Otherwise just click **Sign & anchor on Stellar** and sign in Freighter.
   - *You should see:* all five timeline steps ticked, plus a green **Investment Approved** banner → **View approved record**. That page shows the record ID, record hash, Stellar transaction, ledger and timestamp.
3. On the approved record page, click **Download** to save the approval document (`.json`).

### Step 6: Anyone, no wallet needed
1. Open **/verify**, or click *Verify publicly →* on the approved record page.
2. Paste the **record ID** → **Verify**.
   - *You should see:* **Record found** with the anchored hash and Stellar transaction.
3. Click **+ Check a copy of the record for tampering** → **Load .json file** → choose the downloaded approval document → **Verify**.
   - *You should see:* **MATCH** (green).
4. Edit the amount in the pasted JSON and verify again.
   - *You should see:* **MISMATCH** (red).
5. **Upload Document** tab: enter an attestation's record ID and upload the original prospectus PDF to check that file against the chain.

### Step 7: Asset provider (Amina), showing revocation
1. Product → **Attestations** → on the *Legal structure* declaration, click **Revoke** → sign in Freighter.
   - *You should see:* the declaration shows **Revoked** but stays visible. On the Eligibility Checker, *Legal ownership* now shows an **Exception**. A new request can't clear compliance, but the earlier approval still verifies as MATCH.

### Step 8: Reports (Daniel, Grace or Joseph)
1. **Reports** shows the KPI cards and the **Investments / Attestations / Compliance Exceptions** tabs → **Download Report**.
2. Optional: as Amina, register `spxux-prospectus-summary-v2.pdf` as a new prospectus. It becomes **v2** with a new hash, and reviews of v1 are flagged as needing re-review.

---

## Who can do what

| Action | Provider | Fund manager | Reviewer | Committee | No wallet |
|---|:-:|:-:|:-:|:-:|:-:|
| Browse marketplace and product overview | ✅ | ✅ | ✅ | ✅ | ✅ |
| Register documents | ✅ | | | | |
| Issue provider declaration / revoke it | ✅ | | | | |
| Issue independent review | | | ✅ | | |
| Mark checklist items Submitted | | ✅ | ✅ | | |
| Mark checklist items Reviewed | | | ✅ | | |
| Submit investment request | | ✅ | | | |
| Clear compliance | | | ✅ | | |
| Approve / reject, sign & anchor | | | | ✅ | |
| See requests, approvals, reports | | ✅ | ✅ | ✅ | |
| Verify a record | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## Reset the demo data

Resetting wipes the database back to the starting state: demo users, the SPXUX listing, the custody letter and fact sheet, and nothing else. Records already anchored on Stellar stay on-chain, but the app no longer lists them.

**Live site (Neon database).** Run from `web/` on the computer that's logged in to Neon:
```bash
DATABASE_URL="$(npx neonctl cs --project-id round-block-91308759)" DATABASE_SSL=true npm run db:reset
```

**Local copy:**
```bash
cd web && npm run db:reset
```

To refill the live site with a complete history in one go (all 8 steps, run automatically), run from `web/`:
```bash
BASE_URL=https://pensionbridge-africa.vercel.app \
E2E_PROVIDER_SECRET=$(stellar keys show pb-provider) \
E2E_FUND_MANAGER_SECRET=$(stellar keys show pb-fundmgr) \
E2E_REVIEWER_SECRET=$(stellar keys show pb-reviewer) \
E2E_COMMITTEE_SECRET=$(stellar keys show pb-committee) \
npm run e2e
```

---

## Troubleshooting

| Message | Cause | Fix |
|---|---|---|
| *Freighter wasn't detected in this browser* | Extension missing, disabled, or in another browser profile | Install or enable Freighter in this browser, then reload |
| *Freighter is on PUBLIC. Switch Freighter to Testnet* | Freighter is on Main Net | Freighter → **Main Net** → **Test Net** |
| *INSUFFICIENT FUNDS FOR FEE* (in Freighter) | You're on your own empty wallet, not a demo account | Switch Freighter to an imported demo account (about 10,000 XLM) |
| *This wallet has no role at a demo institution* | Signed in with a wallet that isn't one of the four demo accounts | Switch to a demo account, or onboard this wallet with `scripts/add-tester.sh` (see *Adding a new tester*) |
| *Freighter signed with a different account* | You switched accounts in Freighter while signed in | Log out in the sidebar, then sign in again with the current account |
| A button is missing (for example no **Request Investment**) | You're signed in as the wrong role | Check the name at the bottom-left of the sidebar and switch roles |
