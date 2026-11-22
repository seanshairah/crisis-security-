#!/usr/bin/env node
/**
 * Reference receiver for Crisis Security gate decisions. Zero dependencies: copy it as a starting
 * point for the inventory system. It shows the four things every receiver must do:
 *   1. verify the bearer token and the HMAC signature over the RAW body (reject stale timestamps)
 *   2. remember each deliveryId durably, so a retry never applies a stock change twice
 *   3. acknowledge with {"accepted":true,"deliveryId":"<same id>"} only AFTER the change is stored
 *   4. refuse malformed records with a 4xx so the sender parks them instead of retrying forever
 *
 *   GATE_RECEIVER_TOKEN=... GATE_RECEIVER_SECRET=... node scripts/gate-receiver.mjs [port] [store.json]
 *
 * Point GATE_OUTBOUND_URL at http://127.0.0.1:<port>/ and set GATE_ALLOW_LOCAL_TEST=true for local use.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";

const port = Number(process.argv[2] ?? 4010);
const storePath = process.argv[3] ?? "gate-receiver-store.json";
const token = process.env.GATE_RECEIVER_TOKEN ?? "";
const secret = process.env.GATE_RECEIVER_SECRET ?? "";
if (token.length < 32 || secret.length < 32) {
  console.error("Set GATE_RECEIVER_TOKEN and GATE_RECEIVER_SECRET (32+ characters each).");
  process.exit(1);
}
const store = existsSync(storePath) ? JSON.parse(readFileSync(storePath, "utf8")) : { applied: {} };
const save = () => {
  writeFileSync(storePath + ".tmp", JSON.stringify(store, null, 2));
  renameSync(storePath + ".tmp", storePath); // atomic: a crash never leaves half a file
};

const safeEqual = (a, b) => {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
function verify(headers, raw) {
  if (!safeEqual(headers.authorization ?? "", `Bearer ${token}`)) return false;
  const ts = String(headers["x-crisis-timestamp"] ?? "");
  if (!/^\d{9,12}$/.test(ts) || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const expected = "v1=" + createHmac("sha256", secret).update(`${ts}.${raw}`).digest("hex");
  return safeEqual(expected, String(headers["x-crisis-signature"] ?? ""));
}
const reply = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};

createServer(async (req, res) => {
  if (req.method !== "POST") return reply(res, 405, { error: "POST only" });
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 200_000) return reply(res, 413, { error: "Too large" });
  }
  if (!verify(req.headers, raw)) return reply(res, 401, { error: "Bad signature" });
  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return reply(res, 400, { accepted: false, retryable: false });
  }
  if (event.event === "gate.ping.v1")
    return reply(res, 200, { accepted: true, deliveryId: event.deliveryId });
  if (event.event !== "gate.decision.v1" || !event.deliveryId || !event.movementId)
    return reply(res, 400, { accepted: false, retryable: false });

  // Duplicate (a retry after a lost acknowledgement): acknowledge again, change nothing.
  if (!store.applied[event.deliveryId]) {
    // Replace this block with the real stock update. Do it and store the deliveryId in ONE
    // transaction, then acknowledge. Only an APPROVED decision should move stock.
    store.applied[event.deliveryId] = {
      receivedAt: new Date().toISOString(),
      movementId: event.movementId,
      version: event.version,
      status: event.status,
      direction: event.direction,
      reference: event.externalReference,
      items: event.observed?.items ?? [],
      correctionOf: event.correctionOf,
    };
    save();
    console.log(
      `${event.status} ${event.direction} ${event.externalReference ?? event.movementId} v${event.version}` +
        (event.correctionOf ? " (correction)" : ""),
    );
  }
  reply(res, 200, { accepted: true, deliveryId: event.deliveryId });
}).listen(port, "127.0.0.1", () => console.log(`Reference receiver on http://127.0.0.1:${port}/`));
