/**
 * Picks the database connection strings for a Vercel build, shared by scripts/vercel-build.mjs and src/lib/db-url.ts.
 *
 * Supabase's Vercel integration already creates POSTGRES_URL (transaction pooler, port 6543) and POSTGRES_PRISMA_URL.
 * If DATABASE_URL / MIGRATION_DATABASE_URL are missing, or still hold a template placeholder such as
 * "postgres.►PROJECT_REF►" or "<DB_PASSWORD>", those are used instead, so a pasted template can never break a deploy.
 */

/** True for a value that was never filled in: template arrows, <angle> brackets, or well-known placeholder words. */
export function isPlaceholder(value) {
  return !value || /[►<>]|PROJECT_REF|YOUR-PASSWORD|YOUR_PASSWORD|DB_PASSWORD/.test(value);
}

/** The same connection on the session pooler (port 5432): what migrations need. Query parameters are dropped. */
export function toSessionPooler(url) {
  try {
    const u = new URL(url);
    // Only Supabase's transaction pooler is rewritten; any other connection string is already what migrations need.
    if (u.hostname.endsWith(".pooler.supabase.com") && u.port === "6543") {
      u.port = "5432";
      u.search = "";
    }
    return u.toString();
  } catch {
    return undefined;
  }
}

/** { url, source } for migrations, or { error } saying what to fix. */
export function resolveMigrationUrl(env) {
  const explicit = env.MIGRATION_DATABASE_URL;
  if (!isPlaceholder(explicit)) {
    if (/:6543\//.test(explicit))
      return {
        error:
          "MIGRATION_DATABASE_URL points at the transaction pooler (port 6543), which cannot run migrations. Use the session pooler (port 5432).",
      };
    return { url: explicit, source: "MIGRATION_DATABASE_URL" };
  }
  for (const name of ["POSTGRES_URL", "POSTGRES_PRISMA_URL"]) {
    const derived = isPlaceholder(env[name]) ? undefined : toSessionPooler(env[name]);
    if (derived)
      return {
        url: derived,
        source: `${name} (session pooler, port 5432)`,
        replacedPlaceholder: !!explicit,
      };
  }
  return {
    error: explicit
      ? "MIGRATION_DATABASE_URL still contains a template placeholder (for example ►PROJECT_REF►) and no POSTGRES_URL from the Supabase integration was found. Replace it with the real Supabase session pooler string (port 5432). See docs/SUPABASE_VERCEL.md."
      : "MIGRATION_DATABASE_URL is not set and no POSTGRES_URL from the Supabase integration was found. Set MIGRATION_DATABASE_URL to the Supabase session pooler string (port 5432). See docs/SUPABASE_VERCEL.md.",
  };
}

/** The connection string the running app should use. */
export function resolveRuntimeUrl(env) {
  if (!isPlaceholder(env.DATABASE_URL)) return env.DATABASE_URL;
  for (const name of ["POSTGRES_PRISMA_URL", "POSTGRES_URL"])
    if (!isPlaceholder(env[name])) return env[name];
  return env.DATABASE_URL;
}
