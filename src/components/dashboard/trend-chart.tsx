"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import type { TrendPoint } from "@/lib/services/dashboard";

const SERIES = [
  { key: "sent", name: "Messages sent", color: "var(--color-info)" },
  { key: "replies", name: "Replies received", color: "var(--color-warn)" },
  { key: "confirmations", name: "Confirmations", color: "var(--color-ok)" },
] as const;

function Tip({ active, payload, label }: { active?: boolean; payload?: { dataKey: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-[10px] border border-line bg-surface px-3 py-2 text-[12px] shadow-[var(--shadow-float)]">
      <p className="mb-1 font-semibold text-ink">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center justify-between gap-6 text-ink-2">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: p.color }} />{SERIES.find((s) => s.key === p.dataKey)?.name}</span>
          <span className="font-medium text-ink tnum">{p.value}</span>
        </p>
      ))}
    </div>
  );
}

export function TrendChart({ data }: { data: TrendPoint[] }) {
  return (
    <div className="h-[260px] w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 600, height: 260 }}>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid vertical={false} stroke="var(--color-line)" strokeDasharray="3 4" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "var(--color-ink-3)" }} interval="preserveStartEnd" />
          <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "var(--color-ink-3)" }} allowDecimals={false} width={44} />
          <Tooltip content={<Tip />} cursor={{ stroke: "var(--color-ink-3)", strokeWidth: 1 }} />
          <Legend verticalAlign="top" align="right" height={28} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: "var(--color-ink-2)" }} />
          {SERIES.map((s) => (
            <Line key={s.key} type="monotone" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2} dot={{ r: 3, strokeWidth: 2, stroke: "var(--color-surface)", fill: s.color }} activeDot={{ r: 5, strokeWidth: 2, stroke: "#fff" }} isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
