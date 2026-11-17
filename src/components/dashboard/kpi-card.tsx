import { cn } from "@/lib/cn";
import { Icon, type IconName } from "@/components/ui/icon";

type Tone = "ok" | "warn" | "critical" | "neutral";

const card: Record<Tone, string> = {
  ok: "border-ok/30 bg-ok-soft",
  warn: "border-warn/30 bg-warn-soft",
  critical: "border-critical/40 bg-critical-soft",
  neutral: "border-line bg-surface-2",
};
const note: Record<Tone, string> = {
  ok: "text-ok",
  warn: "text-warn",
  critical: "text-critical",
  neutral: "text-ink-2",
};

function Sparkline({ data, tone }: { data: number[]; tone: Tone }) {
  // A flat line says nothing; show a trend only when there is one.
  if (data.length < 2 || Math.min(...data) === Math.max(...data)) return null;
  const w = 96,
    h = 36;
  const max = Math.max(1, ...data),
    min = Math.min(...data);
  const span = Math.max(1, max - min);
  const pts = data.map(
    (v, i) => [(i / (data.length - 1)) * w, h - 4 - ((v - min) / span) * (h - 8)] as const,
  );
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const stroke =
    tone === "ok"
      ? "var(--color-ok)"
      : tone === "critical"
        ? "var(--color-critical)"
        : tone === "warn"
          ? "var(--color-warn)"
          : "var(--color-ink-3)";
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="shrink-0">
      <path
        d={d}
        fill="none"
        style={{ stroke }}
        strokeWidth="1.75"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** One figure someone acts on: the number, what it is out of, and a one-line reading with an icon (never colour alone). */
export function KpiCard({
  title,
  value,
  of,
  note: reading,
  icon,
  tone,
  series = [],
}: {
  title: string;
  value: number | string;
  of?: string;
  note: string;
  icon: IconName;
  tone: Tone;
  series?: number[];
}) {
  return (
    <section className={cn("rounded-[var(--radius-card)] border p-5", card[tone])}>
      <h3 className="text-[13px] text-ink-2">{title}</h3>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className="text-[38px] font-medium leading-none text-ink tnum">{value}</span>
          {of && <span className="text-[13px] text-ink-2">{of}</span>}
        </div>
        <Sparkline data={series} tone={tone} />
      </div>
      <p className={cn("mt-3 flex items-center gap-1.5 text-[12.5px]", note[tone])}>
        <Icon name={icon} size={16} filled />
        {reading}
      </p>
    </section>
  );
}
