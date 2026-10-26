import { z } from "zod";
import { requireUser } from "@/lib/server/session";
import { createAttestation, handle } from "@/lib/server/workflow";
import { prepare } from "@/lib/server/anchoring";

const body = z.object({
  productId: z.string(),
  documentId: z.string().uuid(),
  type: z.enum(["provider_declaration", "independent_review"]),
  scope: z.string(),
  claim: z.string().min(10).max(500),
  expiresInMinutes: z.number().int().positive().max(60 * 24 * 730).nullable(),
});

/** Creates the attestation record and prepares its Soroban registration for Freighter to sign. */
export const POST = handle(async (req: Request) => {
  const user = await requireUser("provider", "compliance_reviewer");
  const input = body.parse(await req.json());
  const recordId = await createAttestation(user, input);
  return { recordId, chain: await prepare("register_attestation", recordId, user) };
});
