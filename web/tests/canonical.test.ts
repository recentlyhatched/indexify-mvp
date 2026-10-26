import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalize, canonicalizeRecord, normalizeAmount, sha256Hex } from "../src/lib/canonical";

const record = {
  schema: "pensionbridge.approval/1",
  canonicalization: "pbc/1",
  record_id: "a".repeat(64),
  record_version: 1,
  scheme_id: "11111111-1111-4111-8111-111111111111",
  request_reference: "IR-2026-0001",
  product: { id: "spxux", documentation: [{ document_type: "prospectus", version: 1, sha256: "b".repeat(64) }] },
  amount: { value: "25000000.00", currency: "KES" },
  approvers: [{ wallet: "GD4VJVJF4RP54AAKXCGXM5TDCJCZGXHHAMAMXYTMC3TYOKHHBK3D2IGO", role: "committee_member", decision: "approved", decided_at: "2026-10-25T10:00:00.000Z" }],
  decision: "approved",
  decision_at: "2026-10-25T10:00:00.000Z",
  attestations: [],
  supersedes_record_id: null,
};

test("key order does not change the hash", async () => {
  const reordered = Object.fromEntries(Object.entries(record).reverse());
  assert.equal((await canonicalizeRecord(reordered)).hash, (await canonicalizeRecord(record)).hash);
});

test("any field change changes the hash", async () => {
  const a = await canonicalizeRecord(record);
  const b = await canonicalizeRecord({ ...record, amount: { value: "25000001.00", currency: "KES" } });
  assert.notEqual(a.hash, b.hash);
});

test("canonical form is sorted, compact and NFC-normalized", () => {
  assert.equal(canonicalize({ b: 1, a: [true, null], "é": "é" }), '{"a":[true,null],"b":1,"é":"é"}');
});

test("floats and undefined are rejected", () => {
  assert.throws(() => canonicalize({ a: 1.5 }));
  assert.throws(() => canonicalize({ a: undefined }));
});

test("schema rejects unknown fields and bad timestamps", async () => {
  await assert.rejects(canonicalizeRecord({ ...record, note: "x" }));
  await assert.rejects(canonicalizeRecord({ ...record, decision_at: "2026-10-25T10:00:00Z" }));
});

test("known vector", async () => {
  assert.equal(await sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("amount normalization is exact", () => {
  assert.equal(normalizeAmount("25,000,000"), "25000000.00");
  assert.equal(normalizeAmount("0010.5"), "10.50");
  assert.throws(() => normalizeAmount("1.234"));
  assert.throws(() => normalizeAmount("0"));
  assert.throws(() => normalizeAmount("-5"));
});
