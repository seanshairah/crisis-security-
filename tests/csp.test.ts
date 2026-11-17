import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCsp, newNonce } from "../src/lib/security/csp";

test("page scripts need the nonce: no unsafe-inline, no unsafe-eval in production", () => {
  const csp = buildCsp("abc123", false);
  const script = csp.split("; ").find((d) => d.startsWith("script-src"))!;
  assert.match(script, /'nonce-abc123'/);
  assert.match(script, /'strict-dynamic'/);
  assert.doesNotMatch(script, /unsafe-inline/);
  assert.doesNotMatch(script, /unsafe-eval/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
});

test("development allows eval for the dev server only", () => {
  assert.match(buildCsp("n", true), /'unsafe-eval'/);
});

test("every nonce is fresh and long enough", () => {
  const a = newNonce(), b = newNonce();
  assert.notEqual(a, b);
  assert.ok(Buffer.from(a, "base64").length >= 16);
});
