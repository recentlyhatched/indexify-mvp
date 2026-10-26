import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { q1 } from "./db";

const COOKIE = "pb_session";

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set (32+ chars)");
  return new TextEncoder().encode(s);
}

export type Role = "provider" | "fund_manager" | "compliance_reviewer" | "committee_member";

export type SessionUser = {
  id: string;
  wallet_address: string;
  role: Role;
  display_name: string;
  institution_id: string;
  institution_name: string;
};

export async function createSession(wallet: string) {
  const token = await new SignJWT({ wallet })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("8h")
    .sign(secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 8 * 3600,
  });
}

export async function clearSession() {
  (await cookies()).delete(COOKIE);
}

export async function sessionWallet(): Promise<string | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return typeof payload.wallet === "string" ? payload.wallet : null;
  } catch {
    return null;
  }
}

/** The signed-in wallet's role is always loaded from the database, never trusted from the browser. */
export async function currentUser(): Promise<SessionUser | null> {
  const wallet = await sessionWallet();
  if (!wallet) return null;
  return q1<SessionUser>(
    `select u.id, u.wallet_address, u.role, u.display_name, u.institution_id, i.name as institution_name
       from users u join institutions i on i.id = u.institution_id
      where u.wallet_address = $1 and u.is_active`,
    [wallet],
  );
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function requireUser(...roles: Role[]): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw new HttpError(401, "Connect an authorized Freighter wallet first");
  if (roles.length && !roles.includes(user.role)) {
    throw new HttpError(403, `This action requires role: ${roles.join(" or ")}`);
  }
  return user;
}
