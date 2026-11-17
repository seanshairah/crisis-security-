import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
const u = new URL(process.env.DATABASE_URL ?? "http://missing");
if (u.hostname !== "127.0.0.1" || u.port !== "55439" || u.pathname !== "/crisis_test")
  throw Error("Use the isolated verification database");
const base = process.env.CRISIS_TEST_URL ?? "http://localhost:3141";
if (!/^http:\/\/localhost:3141$/.test(base))
  throw Error("Use the isolated test server on port 3141");
const db = new PrismaClient();
const tag = randomUUID();
const password = randomUUID();
const browser = await chromium.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});
await mkdir("artifacts/verification/admin-setup", { recursive: true });
try {
  const user = await db.user.create({
    data: {
      name: "Setup browser verifier",
      email: `${tag}@test.invalid`,
      passwordHash: await bcrypt.hash(password, 10),
      role: "ADMIN",
    },
  });
  const context = await browser.newContext({ viewport: { width: 1366, height: 1000 } });
  const login = await context.request.post(`${base}/api/auth/login`, {
    data: { email: user.email, password },
  });
  assert.equal(login.status(), 200);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${base}/setup`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Get your first patrol ready" }).waitFor();
  const addSite = page.getByRole("button", { name: "Add a new site", exact: true });
  if (await addSite.count()) await addSite.click();
  await page.locator('input[name="name"]').fill(`Browser site ${tag.slice(0, 8)}`);
  await page.locator('input[name="address"]').fill("Isolated verification location");
  await page.getByLabel("Client", { exact: true }).selectOption("");
  await page.locator('input[name="clientName"]').fill("Browser test company");
  await page.locator('input[name="latitude"]').fill("-17.8");
  await page.locator('input[name="longitude"]').fill("31");
  console.log("Creating the site through guided setup");
  await page.getByRole("button", { name: "Save site", exact: true }).click();
  await page.getByRole("heading", { name: "QR checkpoints & patrol timing" }).waitFor();
  await page.getByLabel("Checkpoint name", { exact: true }).fill("Test gate");
  await page.getByRole("button", { name: "Create checkpoint & QR sign", exact: true }).click();
  await page.getByRole("link", { name: "Download QR sign", exact: true }).waitFor();
  const coordinateSiteId = new URL(page.url()).searchParams.get("siteId");
  const point = await db.patrolCheckpoint.findFirstOrThrow({
    where: { locationId: coordinateSiteId, name: "Test gate" },
  });
  assert.equal(point.qrVersion, 2);
  assert.ok(point.qrPayload.startsWith("CS2|"));
  const reprint = await context.request.get(`${base}/api/patrols/checkpoints/${point.id}/sign`);
  assert.equal(reprint.status(), 200);
  assert.ok((await reprint.json()).qrImage.startsWith("data:image/png;base64,"));
  assert.equal(
    (await db.patrolCheckpoint.findUniqueOrThrow({ where: { id: point.id } })).qrHash,
    point.qrHash,
  );
  const legacy = await db.patrolCheckpoint.create({
    data: {
      locationId: coordinateSiteId,
      name: "Legacy gate",
      latitude: -17.8,
      longitude: 31,
      radiusM: 50,
      qrHash: "legacy-isolated-hash",
    },
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Upgrade coordinate QR", exact: true }).click();
  await page
    .getByText("Sign upgraded. Replace the old paper sign and sync the guard phone.", {
      exact: true,
    })
    .waitFor();
  const upgraded = await db.patrolCheckpoint.findUniqueOrThrow({ where: { id: legacy.id } });
  assert.equal(upgraded.qrVersion, 2);
  assert.ok(upgraded.qrPayload.startsWith("CS2|"));
  assert.notEqual(upgraded.qrHash, legacy.qrHash);
  console.log("Coordinate sign creation, unchanged reprint and legacy-sign upgrade verified");

  await page.getByLabel("Turn on patrols for this site", { exact: true }).check();
  await page
    .getByLabel("How often should the guard be prompted?", { exact: true })
    .selectOption("test");
  await page.getByRole("button", { name: "Save patrol timing", exact: true }).click();
  console.log("Site and checkpoint policy saved");
  await page.getByRole("button", { name: "Next: choose a guard →", exact: true }).click();
  const addGuard = page.getByRole("button", { name: "Add a guard", exact: true });
  if (await addGuard.count()) await addGuard.click();
  await page.locator('input[name="firstName"]').fill("Browser");
  await page.locator('input[name="lastName"]').fill("Verifier");
  await page.locator('input[name="phone"]').fill(`0772${Date.now().toString().slice(-6)}`);
  await page.locator('input[name="nationalId"]').fill(`TEST-${tag}`);
  await page.locator('input[name="pin"]').fill("745912");
  await page.getByRole("button", { name: "Save guard & PIN", exact: true }).click();
  console.log("Guard and PIN saved");
  await page.getByRole("button", { name: "Next: connect the phone →", exact: true }).click();
  await page.locator('input[name="phoneNumber"]').fill(`0773${Date.now().toString().slice(-6)}`);
  await page.getByRole("button", { name: "Get activation code", exact: true }).click();
  await page.getByText("Waiting for activation", { exact: true }).waitFor();
  const siteId = new URL(page.url()).searchParams.get("siteId");
  assert.ok(siteId);
  const device = await db.gatewayDevice.findFirstOrThrow({
    where: { locationId: siteId, sharedCompanyDevice: true },
  });
  const activate = await context.request.post(`${base}/api/gateways/activate`, {
    data: {
      activationCode: device.activationCode,
      deviceModel: "API contract test, not a physical phone",
      appVersion: "1.9.1-debug",
    },
  });
  assert.equal(activate.status(), 200, await activate.text());
  await page.getByText("✓ Phone connected", { exact: true }).waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: "Next: schedule the shift →", exact: true }).click();
  const end = new Date(Date.now() + 2 * 3600000);
  const clock = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Johannesburg",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(end);
  await page.locator('input[name="end"]').fill(clock);
  await page.getByRole("button", { name: "Save shift", exact: true }).click();
  await page.getByRole("heading", { name: "✓ Ready for the test run", exact: true }).waitFor();
  await page.screenshot({
    path: "artifacts/verification/admin-setup/ready-desktop.png",
    fullPage: true,
  });
  assert.equal(await page.locator("body").evaluate((el) => el.scrollWidth > innerWidth + 2), false);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "artifacts/verification/admin-setup/ready-mobile.png",
    fullPage: true,
  });
  assert.equal(await page.locator("body").evaluate((el) => el.scrollWidth > innerWidth + 2), false);
  assert.deepEqual(errors, []);
  const after = await db.shift.count({ where: { locationId: siteId } });
  assert.equal(after, 1);
  console.log(
    "PASS: full guided admin workflow through real browser forms, including client/site/map, QR creation, policy preset, guard/PIN, handset activation API contract, scheduled shift and ready checklist; desktop/mobile render without exceptions or overflow. No physical device was involved.",
  );
} finally {
  await browser.close();
  await db.$disconnect();
}
