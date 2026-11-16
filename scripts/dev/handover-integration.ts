import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

const url = new URL(process.env.DATABASE_URL ?? "http://missing");
if (url.hostname !== "127.0.0.1" || url.port !== "55439" || url.pathname !== "/crisis_test") throw Error("Disposable verification database only");

async function main() {
  const { db } = await import("../../src/lib/db");
  const svc = await import("../../src/lib/handover/service");
  const tag = randomUUID().slice(0, 8);
  const mk = (n: string) => db.user.create({ data: { name: `${n} ${tag}`, email: `${n}-${tag}@test.invalid`, passwordHash: "x", role: "SUPERVISOR" } });
  const [a, b] = [await mk("a"), await mk("b")];
  const gone = await db.user.create({ data: { name: `gone ${tag}`, email: `gone-${tag}@test.invalid`, passwordHash: "x", role: "SUPERVISOR", active: false } });
  const key = `shift:${tag}`, key2 = `device:${tag}`;
  try {
    // first claim wins, and a repeat by the same person is harmless
    await svc.claimItem(a.id, key);
    await svc.claimItem(a.id, key);
    await assert.rejects(svc.claimItem(b.id, key), /already handling/);
    await assert.rejects(svc.claimItem(a.id, "alert:abc"), /cannot be claimed/);
    await assert.rejects(svc.claimItem(a.id, "shift:../x"), /cannot be claimed/);
    await svc.claimItem(a.id, key2);
    assert.equal((await svc.currentClaims())[key], `a ${tag}`);

    // only the owner (or an admin) releases
    await svc.releaseItem(b.id, key2);
    assert.equal((await svc.currentClaims())[key2], `a ${tag}`);
    await svc.releaseItem(b.id, key2, true);
    assert.equal((await svc.currentClaims())[key2], undefined);

    // handing over moves every claim, freezes the snapshot, and needs an active, different recipient
    await assert.rejects(svc.handOver(a.id, a.id, []), /someone else/);
    await assert.rejects(svc.handOver(a.id, gone.id, []), /not an active user/);
    const r = await svc.handOver(a.id, b.id, [{ id: key, title: "Late", detail: "x", owner: `a ${tag}` }]);
    assert.equal(r.movedClaims, 1);
    assert.equal((await svc.currentClaims())[key], `b ${tag}`);
    const h = await db.handover.findUniqueOrThrow({ where: { id: r.id } });
    assert.equal(h.acceptedAt, null);
    await assert.rejects(svc.acceptHandover(r.id, a.id), /not found/);
    await svc.acceptHandover(r.id, b.id);
    await assert.rejects(svc.acceptHandover(r.id, b.id), /not found/);

    // notes
    await assert.rejects(svc.addNote(a.id, "   "), /Write the note/);
    await svc.addNote(a.id, "Gate B light is out");
    const note = await db.handoverNote.findFirstOrThrow({ where: { authorId: a.id } });
    await svc.resolveNote(note.id, b.id);
    await assert.rejects(svc.resolveNote(note.id, b.id), /not found/);
    console.log("PASS: first claim wins, owner-only release, handover moves claims and freezes a snapshot, acceptance and notes are single-use.");
  } finally {
    await db.attentionClaim.deleteMany({ where: { userId: { in: [a.id, b.id] } } });
    await db.handover.deleteMany({ where: { OR: [{ fromId: a.id }, { toId: a.id }, { fromId: b.id }, { toId: b.id }] } });
    await db.handoverNote.deleteMany({ where: { authorId: { in: [a.id, b.id] } } });
    await db.user.deleteMany({ where: { id: { in: [a.id, b.id, gone.id] } } });
    await db.$disconnect();
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
