import { clearSession } from "@/lib/server/session";
import { handle } from "@/lib/server/workflow";

export const POST = handle(async () => {
  await clearSession();
  return { ok: true };
});
