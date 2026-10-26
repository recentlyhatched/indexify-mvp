import "server-only";
import { Pool, type PoolClient, type QueryResultRow } from "pg";

const globalForPool = globalThis as unknown as { pbPool?: Pool };

export const pool =
  globalForPool.pbPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "true" ? true : process.env.DATABASE_SSL === "no-verify" ? { rejectUnauthorized: false } : undefined,
    max: 5,
  });
if (process.env.NODE_ENV !== "production") globalForPool.pbPool = pool;

export async function q<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await pool.query<T>(text, params);
  return res.rows;
}

export async function q1<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []): Promise<T | null> {
  return (await q<T>(text, params))[0] ?? null;
}

export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    const out = await fn(c);
    await c.query("commit");
    return out;
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}

export async function audit(
  actor: string | null,
  institutionId: string | null,
  action: string,
  entityType: string,
  entityId: string,
  details: Record<string, unknown> = {},
  client?: PoolClient,
) {
  const sql = `insert into audit_events (actor_wallet, institution_id, action, entity_type, entity_id, details) values ($1,$2,$3,$4,$5,$6)`;
  const params = [actor, institutionId, action, entityType, entityId, JSON.stringify(details)];
  if (client) await client.query(sql, params);
  else await pool.query(sql, params);
}
