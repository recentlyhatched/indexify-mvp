/**
 * Canonical JSON + SHA-256 used for every hashed record.
 *
 * Rules (canonicalization version "pbc/1"):
 *  - Input is validated against a fixed schema before serialization.
 *  - Object keys are sorted by UTF-16 code unit order (RFC 8785 / JCS ordering).
 *  - Strings are Unicode NFC-normalized, then escaped exactly like JSON.stringify.
 *  - Only safe integers are allowed as numbers; amounts are decimal strings.
 *  - Optional fields are always present; absence is written as `null`. `undefined` is rejected.
 *  - Timestamps are UTC ISO 8601 with milliseconds: YYYY-MM-DDTHH:mm:ss.sssZ.
 *  - The hash is SHA-256 over the canonical UTF-8 bytes, lowercase hex.
 *
 * Runs unchanged in the browser and on the server (WebCrypto).
 */
import { z } from "zod";

export const CANONICALIZATION_VERSION = "pbc/1";

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

export function canonicalize(value: unknown): string {
  return serialize(value as Json, "$");
}

function serialize(v: Json, path: string): string {
  if (v === null) return "null";
  if (v === undefined) throw new Error(`Undefined value at ${path}; use null`);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") {
    if (!Number.isSafeInteger(v)) throw new Error(`Non-integer number at ${path}; use a decimal string`);
    return String(v);
  }
  if (typeof v === "string") return JSON.stringify(v.normalize("NFC"));
  if (Array.isArray(v)) return `[${v.map((x, i) => serialize(x, `${path}[${i}]`)).join(",")}]`;
  if (typeof v === "object") {
    const keys = Object.keys(v).map((k) => k.normalize("NFC")).sort(compareUtf16);
    const obj = v as Record<string, Json>;
    return `{${keys.map((k) => `${JSON.stringify(k)}:${serialize(obj[k], `${path}.${k}`)}`).join(",")}}`;
  }
  throw new Error(`Unsupported value at ${path}`);
}

function compareUtf16(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashCanonical(value: unknown): Promise<{ canonical: string; hash: string }> {
  const canonical = canonicalize(value);
  return { canonical, hash: await sha256Hex(canonical) };
}

// ---- Schemas ---------------------------------------------------------------

const isoUtc = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, "UTC ISO 8601 with milliseconds");
const hex32 = z.string().regex(/^[0-9a-f]{64}$/, "32-byte lowercase hex");
const wallet = z.string().regex(/^G[A-Z2-7]{55}$/, "Stellar public key");

export const approvalPayloadSchema = z
  .object({
    schema: z.literal("pensionbridge.approval/1"),
    canonicalization: z.literal(CANONICALIZATION_VERSION),
    record_id: hex32,
    record_version: z.number().int().positive(),
    scheme_id: z.string().uuid(),
    request_reference: z.string(),
    product: z
      .object({
        id: z.string(),
        documentation: z.array(z.object({ document_type: z.string(), version: z.number().int(), sha256: hex32 }).strict()),
      })
      .strict(),
    amount: z.object({ value: z.string().regex(/^\d+\.\d{2}$/), currency: z.string().regex(/^[A-Z]{3}$/) }).strict(),
    approvers: z.array(
      z.object({ wallet, role: z.string(), decision: z.enum(["cleared", "approved", "rejected"]), decided_at: isoUtc }).strict(),
    ),
    decision: z.enum(["approved", "rejected"]),
    decision_at: isoUtc,
    attestations: z.array(z.object({ public_record_id: hex32, attestation_type: z.string(), payload_hash: hex32 }).strict()),
    supersedes_record_id: hex32.nullable(),
  })
  .strict();
export type ApprovalPayload = z.infer<typeof approvalPayloadSchema>;

export const attestationPayloadSchema = z
  .object({
    schema: z.literal("pensionbridge.attestation/1"),
    canonicalization: z.literal(CANONICALIZATION_VERSION),
    record_id: hex32,
    attestation_type: z.enum(["provider_declaration", "independent_review"]),
    product_id: z.string(),
    document: z.object({ document_type: z.string(), version: z.number().int(), sha256: hex32 }).strict(),
    review_scope: z.string(),
    claim: z.string(),
    issuer_wallet: wallet,
    issued_at: isoUtc,
    expires_at: isoUtc.nullable(),
  })
  .strict();
export type AttestationPayload = z.infer<typeof attestationPayloadSchema>;

/** Validates any supported record and returns its canonical form and hash. */
export async function canonicalizeRecord(input: unknown) {
  const schema = (input as { schema?: string })?.schema;
  const parsed =
    schema === "pensionbridge.attestation/1"
      ? attestationPayloadSchema.parse(input)
      : approvalPayloadSchema.parse(input);
  return hashCanonical(parsed);
}

export function isoNow(d: Date = new Date()): string {
  return d.toISOString();
}

/** Normalizes a user-entered amount to a fixed two-decimal string, never via floating point. */
export function normalizeAmount(raw: string): string {
  const s = raw.replace(/[,\s_]/g, "");
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) throw new Error("Amount must be a positive number with at most 2 decimals");
  const whole = m[1].replace(/^0+(?=\d)/, "");
  const frac = (m[2] ?? "").padEnd(2, "0");
  if (whole === "0" && frac === "00") throw new Error("Amount must be greater than zero");
  return `${whole}.${frac}`;
}
