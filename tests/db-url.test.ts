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
