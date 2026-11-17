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

const run = (cmd, env = {}) => execSync(cmd, { stdio: "inherit", env: { ...process.env, ...env } });
const production = process.env.VERCEL_ENV === "production";
const migrationUrl = process.env.MIGRATION_DATABASE_URL;

if (production && process.env.SKIP_DB_MIGRATIONS !== "true") {
  if (!migrationUrl) {
    console.error(
      "MIGRATION_DATABASE_URL is not set. Set it to the Supabase session pooler connection string (port 5432). See docs/SUPABASE_VERCEL.md.",
    );
    process.exit(1);
  }
  if (/:6543\//.test(migrationUrl)) {
    console.error(
      "MIGRATION_DATABASE_URL points at the transaction pooler (port 6543), which cannot run migrations. Use the session pooler (port 5432).",
    );
    process.exit(1);
  }
  console.log("Applying database migrations…");
  run("npx prisma migrate deploy", { DATABASE_URL: migrationUrl });
  console.log("Ensuring settings, message templates and the super admin exist…");
  run("npx tsx prisma/seed.ts", { DATABASE_URL: migrationUrl });
} else {
  console.log(
    `Skipping migrations (${production ? "SKIP_DB_MIGRATIONS=true" : `VERCEL_ENV=${process.env.VERCEL_ENV ?? "unset"}`}).`,
  );
}
run("npm run build");
