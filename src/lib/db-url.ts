import { resolveRuntimeUrl } from "../../scripts/db-urls.mjs";

/**
 * Supabase's transaction pooler (Supavisor, port 6543) does not support prepared statements, so Prisma must be told
 * (`pgbouncer=true`), and a serverless function should hold only a few connections. Applied automatically so a
 * connection string pasted straight from the Supabase dashboard works. Any value already in the URL is kept.
 *
 * If DATABASE_URL was never filled in (a template placeholder), the Supabase integration's POSTGRES_PRISMA_URL is used.
 */
export const SERVERLESS_CONNECTION_LIMIT = "3";

export function databaseUrlFromEnv(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  return runtimeDatabaseUrl(resolveRuntimeUrl(env));
}

export function runtimeDatabaseUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return url;
  }
  if (!u.hostname.endsWith(".pooler.supabase.com") || u.port !== "6543") return url;
  if (!u.searchParams.has("pgbouncer")) u.searchParams.set("pgbouncer", "true");
  if (!u.searchParams.has("connection_limit"))
    u.searchParams.set("connection_limit", SERVERLESS_CONNECTION_LIMIT);
  return u.toString();
}
