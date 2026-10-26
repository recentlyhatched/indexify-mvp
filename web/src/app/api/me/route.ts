import { currentUser, sessionWallet } from "@/lib/server/session";
import { handle } from "@/lib/server/workflow";

export const GET = handle(async () => ({ wallet: await sessionWallet(), user: await currentUser() }));
