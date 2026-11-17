import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { DomainError } from "@/lib/security/api-errors";
import type { QueueClaims, QueueItem } from "@/lib/dashboard/queue";

/** Only these rows can be claimed. Alerts are owned through acknowledgement, never through a claim. */
export const CLAIM_KEY = /^(shift|device):[A-Za-z0-9_-]{1,64}$/;

export async function currentClaims(): Promise<QueueClaims> {
  const rows = await db.attentionClaim.findMany({
    include: { user: { select: { name: true, active: true } } },
  });
  return Object.fromEntries(rows.filter((r) => r.user.active).map((r) => [r.itemKey, r.user.name]));
}

/** First claim wins: taking a row somebody already has is refused, so two operators never both think it is theirs. */
export async function claimItem(userId: string, itemKey: string) {
  if (!CLAIM_KEY.test(itemKey)) throw new DomainError("That item cannot be claimed");
  try {
    await db.attentionClaim.create({ data: { itemKey, userId } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const mine = await db.attentionClaim.findUnique({ where: { itemKey } });
      if (mine?.userId === userId) return;
      throw new DomainError("Someone else is already handling this", 409);
    }
    throw e;
  }
}

export async function releaseItem(userId: string, itemKey: string, isAdmin = false) {
  if (!CLAIM_KEY.test(itemKey)) throw new DomainError("That item cannot be released");
  await db.attentionClaim.deleteMany({ where: { itemKey, ...(isAdmin ? {} : { userId }) } });
}

export type SnapshotItem = { id: string; title: string; detail: string; owner: string | null };

export function snapshotOf(items: QueueItem[]): SnapshotItem[] {
  return items.map((i) => ({
    id: i.id,
    title: i.title,
    detail: i.detail,
    owner: i.owner?.state === "handled" ? i.owner.label.replace(/^Handling: /, "") : null,
  }));
}

/** Hands the desk over: freezes what was open, and moves every claim the outgoing operator holds to the incoming one, in one transaction. */
export async function handOver(fromId: string, toId: string, snapshot: SnapshotItem[]) {
  if (fromId === toId) throw new DomainError("Choose someone else to hand over to");
  const to = await db.user.findFirst({ where: { id: toId, active: true }, select: { id: true } });
  if (!to) throw new DomainError("That person is not an active user");
  return db.$transaction(async (tx) => {
    const moved = await tx.attentionClaim.updateMany({
      where: { userId: fromId },
      data: { userId: toId, claimedAt: new Date() },
    });
    const h = await tx.handover.create({
      data: { fromId, toId, snapshot: snapshot as unknown as Prisma.InputJsonValue },
    });
    return { id: h.id, movedClaims: moved.count };
  });
}

export async function acceptHandover(id: string, userId: string) {
  const r = await db.handover.updateMany({
    where: { id, toId: userId, acceptedAt: null },
    data: { acceptedAt: new Date() },
  });
  if (!r.count) throw new DomainError("Handover not found");
}

export async function addNote(authorId: string, body: string) {
  const text = body.trim();
  if (!text) throw new DomainError("Write the note first");
  if (text.length > 500) throw new DomainError("Keep the note under 500 characters");
  await db.handoverNote.create({ data: { authorId, body: text } });
}

export async function resolveNote(id: string, userId: string) {
  const r = await db.handoverNote.updateMany({
    where: { id, resolvedAt: null },
    data: { resolvedAt: new Date(), resolvedById: userId },
  });
  if (!r.count) throw new DomainError("Note not found");
}
