import { networkCheck } from "@/lib/server/chain";
import { handle } from "@/lib/server/workflow";

export const GET = handle(async () => {
  try {
    return { ok: true, ...(await networkCheck()) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
});
