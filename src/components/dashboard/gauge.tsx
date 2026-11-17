/** Attendance ring. The reading is the number in the middle; colour only adds to it (green from 85, amber from 60, red below). */
export function Gauge({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const colour =
    v >= 85 ? "var(--color-ok)" : v >= 60 ? "var(--color-warn)" : "var(--color-critical)";
  return (
    <div
      role="img"
      aria-label={`Attendance ${v}%`}
      className="grid h-[150px] w-[150px] place-items-center rounded-full"
      style={{ background: `conic-gradient(${colour} 0 ${v}%, var(--color-line) ${v}% 100%)` }}
    >
      <div className="grid h-[114px] w-[114px] place-items-center rounded-full bg-surface text-[34px] font-medium text-ink tnum">
        {v}%
      </div>
    </div>
  );
}
