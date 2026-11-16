import { requireUser } from "@/lib/auth/rbac";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui/page";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Button, buttonClass } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";
import { loadQueue } from "@/lib/handover/queue-data";
import { acceptHandoverAction, addNoteAction, handOverAction, resolveNoteAction } from "@/actions/handover";
import { ago } from "@/lib/time";
import type { SnapshotItem } from "@/lib/handover/service";

export const metadata = { title: "Shift handover" };

export default async function HandoverPage() {
  const user = await requireUser();
  const [queue, notes, incoming, last, people] = await Promise.all([
    loadQueue(50),
    db.handoverNote.findMany({ where: { resolvedAt: null }, include: { author: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 30 }),
    db.handover.findMany({ where: { toId: user.id, acceptedAt: null }, include: { from: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 3 }),
    db.handover.findFirst({ orderBy: { createdAt: "desc" }, include: { from: { select: { name: true } }, to: { select: { name: true } } } }),
    db.user.findMany({ where: { active: true, id: { not: user.id } }, select: { id: true, name: true, role: true }, orderBy: { name: "asc" } }),
  ]);
  const unowned = queue.filter((i) => i.owner?.state !== "handled" && i.kind !== "alert").length + queue.filter((i) => i.kind === "alert" && i.owner?.state !== "handled").length;

  return (
    <div className="min-w-0 space-y-4">
      <PageHeader title="Shift handover" description={last ? `Last handover: ${last.from.name} → ${last.to.name}, ${ago(last.createdAt)}.` : "Nothing has been handed over yet."} />

      {incoming.map((h) => {
        const items = h.snapshot as unknown as SnapshotItem[];
        return (
          <Card key={h.id} className="border-accent/50">
            <CardHeader title={`${h.from.name} is handing the desk to you`} description={`${items.length} open item${items.length === 1 ? "" : "s"} when they handed over · ${ago(h.createdAt)}`} action={<form action={acceptHandoverAction.bind(null, h.id)}><Button variant="primary" size="sm">Accept handover</Button></form>} />
            <CardBody className="pt-3"><ul className="space-y-1.5 text-[13px] text-ink-2">{items.slice(0, 8).map((i) => <li key={i.id}><span className="text-ink">{i.title}</span> · {i.detail}</li>)}</ul></CardBody>
          </Card>
        );
      })}

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="What is open right now" description={queue.length === 0 ? "Nothing needs anyone." : `${queue.length} open · ${unowned} nobody has taken yet`} />
          <CardBody className="pt-3">
            {queue.length === 0 ? (
              <p className="flex items-center gap-2 text-[13px] text-ink-2"><Icon name="verified_user" size={18} className="text-ok" filled />Everything is in order. You can hand over with a clean desk.</p>
            ) : (
              <ul className="space-y-2">
                {queue.map((i) => (
                  <li key={i.id} className="flex items-center gap-3 rounded-[18px] bg-surface-2 px-3.5 py-3">
                    <Icon name={i.icon} size={22} className={i.tone === "critical" ? "text-critical" : "text-warn"} filled />
                    <div className="min-w-0 flex-1"><p className="truncate text-[14px] font-medium text-ink">{i.title}</p><p className="truncate text-[12px] text-ink-2">{i.detail}</p></div>
                    <span className={cn("shrink-0 text-[12px]", i.owner?.state === "handled" ? "text-ok" : "text-ink-3")}>{i.owner ? i.owner.label.replace("Handling: ", "") : "—"}</span>
                  </li>
                ))}
              </ul>
            )}
            <form action={handOverAction} className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
              <label className="text-[13px] text-ink-2" htmlFor="toId">Hand over to</label>
              <select id="toId" name="toId" required defaultValue="" className="h-11 rounded-full border border-line bg-surface-2 px-4 text-sm text-ink">
                <option value="" disabled>Choose a person</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <button className={buttonClass("primary")} disabled={people.length === 0}>Hand over</button>
              <p className="w-full text-[12px] text-ink-3">Everything you have taken moves to them. What is open is saved with the handover so they can see how it stood.</p>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Notes for the next operator" description="Stay here until someone marks them done." />
          <CardBody className="pt-3">
            <ul className="space-y-2">
              {notes.length === 0 && <li className="text-[13px] text-ink-3">No notes.</li>}
              {notes.map((n) => (
                <li key={n.id} className="flex items-start gap-3 rounded-[18px] bg-surface-2 px-3.5 py-3">
                  <Icon name="sticky_note_2" size={20} className="mt-0.5 text-ink-2" filled />
                  <div className="min-w-0 flex-1"><p className="text-[14px] text-ink">{n.body}</p><p className="text-[12px] text-ink-3">{n.author.name} · {ago(n.createdAt)}</p></div>
                  <form action={resolveNoteAction.bind(null, n.id)}><button className={buttonClass("ghost", "sm")}>Done</button></form>
                </li>
              ))}
            </ul>
            <form action={addNoteAction} className="mt-4 flex gap-2">
              <input name="body" maxLength={500} required placeholder="e.g. Gate B light is out, maintenance called" className="h-11 min-w-0 flex-1 rounded-full border border-line bg-surface-2 px-4 text-sm text-ink placeholder:text-ink-3" />
              <button className={buttonClass("secondary")}>Add</button>
            </form>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
