"use server";

import { revalidatePath } from "next/cache";
import { actor, auditAs } from "./_helpers";
import {
  acceptHandover,
  addNote,
  claimItem,
  handOver,
  releaseItem,
  resolveNote,
  snapshotOf,
} from "@/lib/handover/service";
import { loadQueue } from "@/lib/handover/queue-data";

function refresh() {
  revalidatePath("/dashboard");
  revalidatePath("/handover");
}

export async function claimAction(itemKey: string) {
  const user = await actor("SUPERVISOR");
  await claimItem(user.id, itemKey);
  await auditAs(user, "ATTENTION_CLAIMED", "AttentionClaim", itemKey);
  refresh();
}

export async function releaseAction(itemKey: string) {
  const user = await actor("SUPERVISOR");
  await releaseItem(user.id, itemKey, user.role !== "SUPERVISOR");
  await auditAs(user, "ATTENTION_RELEASED", "AttentionClaim", itemKey);
  refresh();
}

export async function addNoteAction(formData: FormData) {
  const user = await actor("SUPERVISOR");
  await addNote(user.id, String(formData.get("body") ?? ""));
  refresh();
}

export async function resolveNoteAction(id: string) {
  const user = await actor("SUPERVISOR");
  await resolveNote(id, user.id);
  refresh();
}

export async function handOverAction(formData: FormData) {
  const user = await actor("SUPERVISOR");
  const toId = String(formData.get("toId") ?? "");
  const queue = await loadQueue(50);
  const r = await handOver(user.id, toId, snapshotOf(queue));
  await auditAs(user, "SHIFT_HANDOVER", "Handover", r.id, {
    toId,
    movedClaims: r.movedClaims,
    items: queue.length,
  });
  refresh();
}

export async function acceptHandoverAction(id: string) {
  const user = await actor("SUPERVISOR");
  await acceptHandover(id, user.id);
  await auditAs(user, "SHIFT_HANDOVER_ACCEPTED", "Handover", id);
  refresh();
}
