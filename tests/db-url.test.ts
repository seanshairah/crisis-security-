import { test } from "node:test";
import assert from "node:assert/strict";
import { runtimeDatabaseUrl } from "../src/lib/db-url";

test("Supabase transaction pooler gets pgbouncer mode and a small connection limit", () => {
  const out = new URL(
    runtimeDatabaseUrl(
      "postgresql://postgres.abc:pw@aws-0-eu-west-2.pooler.supabase.com:6543/postgres",
    )!,
  );
  assert.equal(out.searchParams.get("pgbouncer"), "true");
  assert.equal(out.searchParams.get("connection_limit"), "3");
});

test("values already in the URL win", () => {
  const out = new URL(
    runtimeDatabaseUrl(
      "postgresql://u:p@aws-0-eu-west-2.pooler.supabase.com:6543/postgres?connection_limit=1&pgbouncer=true",
    )!,
  );
  assert.equal(out.searchParams.get("connection_limit"), "1");
});

test("session pooler, direct connections and other hosts are left alone", () => {
  for (const url of [
    "postgresql://u:p@aws-0-eu-west-2.pooler.supabase.com:5432/postgres",
    "postgresql://postgres:p@db.abc.supabase.co:5432/postgres",
    "postgresql://u:p@localhost:5432/crisis",
    "not a url",
  ])
    assert.equal(runtimeDatabaseUrl(url), url);
  assert.equal(runtimeDatabaseUrl(undefined), undefined);
});

import { resolveMigrationUrl, resolveRuntimeUrl, isPlaceholder } from "../scripts/db-urls.mjs";

const integration =
  "postgres://postgres.abcd1234:s3cret@aws-1-eu-west-2.pooler.supabase.com:6543/postgres?sslmode=require&supa=base-pooler.x";

test("template placeholders are recognised, real values are not", () => {
  for (const v of [
    "postgresql://postgres.►PROJECT_REF►:pw@h:5432/postgres",
    "postgresql://u:<DB_PASSWORD>@h/db",
    undefined,
    "",
  ])
    assert.equal(isPlaceholder(v), true, String(v));
  assert.equal(
    isPlaceholder(
      "postgresql://postgres.abcd:pw@aws-0-eu-west-2.pooler.supabase.com:5432/postgres",
    ),
    false,
  );
});

test("a placeholder MIGRATION_DATABASE_URL falls back to the integration's POSTGRES_URL on the session pooler", () => {
  const r = resolveMigrationUrl({
    MIGRATION_DATABASE_URL: "postgresql://postgres.►PROJECT_REF►:x@h:5432/postgres",
    POSTGRES_URL: integration,
  });
  assert.equal(r.error, undefined);
  assert.equal(
    r.url,
    "postgres://postgres.abcd1234:s3cret@aws-1-eu-west-2.pooler.supabase.com:5432/postgres",
  );
  assert.equal(r.replacedPlaceholder, true);
});

test("a real MIGRATION_DATABASE_URL is used as is, but the transaction pooler is refused", () => {
  const good = "postgresql://postgres.abcd:pw@aws-0-eu-west-2.pooler.supabase.com:5432/postgres";
  assert.equal(
    resolveMigrationUrl({ MIGRATION_DATABASE_URL: good, POSTGRES_URL: integration }).url,
    good,
  );
  assert.match(
    resolveMigrationUrl({ MIGRATION_DATABASE_URL: good.replace(":5432", ":6543") }).error!,
    /transaction pooler/,
  );
});

test("with nothing usable the error says what to fix", () => {
  assert.match(
    resolveMigrationUrl({ MIGRATION_DATABASE_URL: "postgres.►PROJECT_REF►" }).error!,
    /placeholder/,
  );
  assert.match(resolveMigrationUrl({}).error!, /not set/);
});

test("the running app prefers DATABASE_URL, then the integration's POSTGRES_PRISMA_URL", () => {
  assert.equal(
    resolveRuntimeUrl({ DATABASE_URL: "postgresql://real@h/db", POSTGRES_PRISMA_URL: "x" }),
    "postgresql://real@h/db",
  );
  assert.equal(
    resolveRuntimeUrl({ DATABASE_URL: "postgres.►PROJECT_REF►", POSTGRES_PRISMA_URL: integration }),
    integration,
  );
});

test("only the Supabase transaction pooler is rewritten to the session pooler", async () => {
  const { toSessionPooler } = await import("../scripts/db-urls.mjs");
  assert.equal(
    toSessionPooler("postgres://u:p@h.pooler.supabase.com:6543/postgres?x=1"),
    "postgres://u:p@h.pooler.supabase.com:5432/postgres",
  );
  assert.equal(
    toSessionPooler("postgres://u:p@db.example.com:5432/app?sslmode=require"),
    "postgres://u:p@db.example.com:5432/app?sslmode=require",
  );
});
