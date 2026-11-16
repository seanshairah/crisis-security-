import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { QueueItem } from "@/lib/dashboard/queue";

/** The ranked "Needs you now" list: most urgent first, who has it, and one primary action per row. */
export function NeedsYouNow({
  items,
  calm,
}: {
  items: QueueItem[];
  calm: { guards: number; patrolsVerified: number };
}) {
  if (items.length === 0) {
    return (
      <section className="flex flex-col items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface px-6 py-10 text-center">
        <span className="grid h-[84px] w-[84px] place-items-center rounded-full border border-ok/30 bg-ok-soft text-ok">
          <Icon name="verified_user" size={44} filled />
        </span>
        <h2 className="font-display text-[32px] leading-none text-ink">Everything is in order</h2>
        <p className="max-w-[360px] text-[14px] text-ink-2">
          {calm.guards} guard{calm.guards === 1 ? "" : "s"} on post, {calm.patrolsVerified} patrol
          {calm.patrolsVerified === 1 ? "" : "s"} verified, nothing waiting on you. This list stays
          quiet until something changes.
        </p>
      </section>
    );
  }
  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:p-5">
      <header className="mb-3 flex items-baseline justify-between">
        <h2 className="text-[18px] font-semibold text-ink">Needs you now</h2>
        <span className="text-[12px] text-ink-3">Most urgent first</span>
      </header>
      <ul className="space-y-2.5">
        {items.map((i, idx) => {
          const urgent = i.tone === "critical" && idx === 0 && i.owner?.state !== "handled";
          return (
            <li
              key={i.id}
              className={cn(
                "flex flex-wrap items-center gap-x-4 gap-y-3 rounded-[20px] border p-3.5",
                urgent ? "border-critical/50 bg-critical-soft" : "border-line bg-surface-2",
              )}
            >
              <span
                className={cn(
                  "grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[13px]",
                  urgent ? "bg-critical-solid text-white" : "bg-surface",
                  !urgent && (i.tone === "critical" ? "text-critical" : "text-warn"),
                )}
              >
                <Icon name={i.icon} size={22} filled />
              </span>
              <div className="min-w-0 flex-1 basis-[220px]">
                <p className="text-[15px] font-semibold text-ink">{i.title}</p>
                <p className="mt-0.5 text-[12.5px] text-ink-2">{i.detail}</p>
                {i.owner && (
                  <p
                    className={cn(
                      "mt-1.5 flex items-center gap-1.5 text-[12px]",
                      i.owner.state === "handled"
                        ? "text-ok"
                        : urgent
                          ? "text-critical"
                          : "text-ink-2",
                    )}
                  >
                    <Icon
                      name={i.owner.state === "handled" ? "person" : "person_off"}
                      size={15}
                      filled
                    />
                    {i.owner.label}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                <Link
                  href={i.href}
                  className={buttonClass(
                    i.owner?.state === "handled" || i.kind !== "alert" ? "secondary" : "primary",
                    "sm",
                  )}
                >
                  {i.kind === "alert"
                    ? i.owner?.state === "handled"
                      ? "Open"
                      : "Acknowledge"
                    : "Open"}
                </Link>
                {i.phone && (
                  <a href={`tel:${i.phone}`} className={buttonClass("secondary", "sm")}>
                    Call
                  </a>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
