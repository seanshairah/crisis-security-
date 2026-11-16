import { cn } from "@/lib/cn";
import { Icon } from "@/components/ui/icon";

export function PageHeader({ title, description, actions, className }: { title: string; description?: string; actions?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-4 flex flex-wrap items-end justify-between gap-3 sm:mb-5", className)}>
      <div>
        <h1 className="font-display text-[34px] leading-[1.05] text-ink sm:text-[40px]">{title}</h1>
        {description && <p className="mt-2 text-[14px] text-ink-2">{description}</p>}
      </div>
      {actions && <div className="flex max-w-full flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Uppercase micro label over a value. */
export function Meta({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-3">{label}</div>
      <div className="mt-1 break-words text-[14px] text-ink">{children}</div>
    </div>
  );
}

/** Segmented filter bar with counts. */
export function Segments({ items, className }: { items: { href: string; label: string; count?: number; active: boolean; tone?: "ok" | "warn" | "critical" | "neutral" }[]; className?: string }) {
  const dot = { ok: "bg-ok", warn: "bg-warn", critical: "bg-critical", neutral: "border-[1.5px] border-ink-3" };
  return (
    // On a phone these wrap. Scrolling them sideways clipped the last tab mid-word with no
    // affordance, which reads as a broken page rather than as "there is more over here".
    <div className={cn("flex max-w-full flex-wrap items-center gap-0.5 rounded-full border border-line bg-surface-2 p-0.5 sm:flex-nowrap sm:overflow-x-auto sm:scroll-thin sm:inline-flex", className)}>
      {items.map((it) => (
        <a key={it.href} href={it.href} className={cn("inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13px] font-medium transition-colors", it.active ? "bg-surface text-ink shadow-[var(--shadow-rest)] border border-line" : "text-ink-2 hover:text-ink")}>
          {it.tone && <span className={cn("h-1.5 w-1.5 rounded-full", dot[it.tone])} />}
          {it.label}
          {typeof it.count === "number" && <span className="text-[12px] text-ink-3 tnum">{it.count}</span>}
        </a>
      ))}
    </div>
  );
}

/**
 * Progressive disclosure for operational detail. The screen carries the short label; the rules
 * behind it (how a fix is measured, what a reason code means) live one click away, next to the
 * control they describe, instead of in a paragraph every operator reads once and then skips.
 */
export function Explainer({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <details className={cn("group rounded-[8px] border border-line bg-surface-2/60 text-[12.5px]", className)}>
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-2.5 py-1.5 font-medium text-ink-2 hover:text-ink">
        <Icon name="info" size="sm" className="text-ink-3" />
        {title}
        <Icon name="keyboard_arrow_down" size="sm" className="ml-auto text-ink-3 transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-1.5 border-t border-line px-2.5 py-2 text-ink-2">{children}</div>
    </details>
  );
}

export type SummaryTile = { label: string; value: number | string; note?: string; tone?: "ok" | "warn" | "critical" | "neutral" };

/** Four figures above a list: what is in it, at a glance, before the filters and the table. */
export function SummaryTiles({ items, className }: { items: SummaryTile[]; className?: string }) {
  const tint = { ok: "border-ok/30 bg-ok-soft", warn: "border-warn/30 bg-warn-soft", critical: "border-critical/40 bg-critical-soft", neutral: "border-line bg-surface-2" };
  return (
    <div className={cn("mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4", className)}>
      {items.map((t) => (
        <div key={t.label} className={cn("rounded-[20px] border px-4 py-3.5", tint[t.tone ?? "neutral"])}>
          <p className="text-[12.5px] text-ink-2">{t.label}</p>
          <p className="mt-1 text-[30px] font-medium leading-none text-ink tnum">{t.value}</p>
          {t.note && <p className="mt-1.5 text-[12px] text-ink-3">{t.note}</p>}
        </div>
      ))}
    </div>
  );
}
