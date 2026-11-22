/**
 * Vercel build: apply database migrations and the baseline (production only), then build the app.
 *
 *   MIGRATION_DATABASE_URL  connection used for migrations and the baseline. Use Supabase's *session* pooler
 *                           (port 5432); the transaction pooler (6543) cannot run migrations, and the direct
 *                           db.<ref>.supabase.co address is IPv6-only on the free plan.
 *   SKIP_DB_MIGRATIONS=true  build only, for example while pointing at a database that must not be changed.
 *
 * Preview deployments never migrate: a preview of a branch must not change the production database.
 */
import { execSync } from "node:child_process";
import { resolveMigrationUrl } from "./db-urls.mjs";

const run = (cmd, env = {}) => execSync(cmd, { stdio: "inherit", env: { ...process.env, ...env } });
const production = process.env.VERCEL_ENV === "production";
if (production && process.env.SKIP_DB_MIGRATIONS !== "true") {
  const resolved = resolveMigrationUrl(process.env);
  if (resolved.error) {
    console.error(resolved.error);
    process.exit(1);
  }
  if (resolved.replacedPlaceholder)
    console.warn(
      "MIGRATION_DATABASE_URL still held a template placeholder; using the Supabase integration's POSTGRES_URL instead. Replace it with the real value to silence this.",
    );
  console.log(`Applying database migrations (using ${resolved.source})…`);
  run("npx prisma migrate deploy", { DATABASE_URL: resolved.url });
  console.log("Ensuring settings, message templates and the super admin exist…");
  run("npx tsx prisma/seed.ts", { DATABASE_URL: resolved.url });
} else {
  console.log(
    `Skipping migrations (${production ? "SKIP_DB_MIGRATIONS=true" : `VERCEL_ENV=${process.env.VERCEL_ENV ?? "unset"}`}).`,
  );
}
run("npm run build");
