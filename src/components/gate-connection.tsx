"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export type ConnectionStatus = {
  outbound: { configured: boolean; problems: string[]; host: string | null };
  inbound: { ok: boolean; problems: string[]; signed: boolean };
  counts: { pending: number; failed: number; sent: number; needsAttention: number };
  lastDeliveredAt: string | null;
  lastFailure: { createdAt: string; detail: string; httpStatus: number | null } | null;
  oldestWaitingAt: string | null;
};

const when = (v: string | null) => (v ? new Date(v).toLocaleString() : "Never");

/** Admin-only. Shows whether the inventory system is reachable and lets an operator test or flush the queue. */
export function GateConnection({ status }: { status: ConnectionStatus }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const act = async (url: string, ok: (r: Record<string, unknown>) => string) => {
    setBusy(true);
    setNote("");
    try {
      const res = await fetch(url, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      setNote(res.ok ? ok(body) : String(body.detail ?? body.error ?? "Request failed"));
      router.refresh();
    } catch {
      setNote("Could not reach the portal. Try again.");
    } finally {
      setBusy(false);
    }
  };
  const healthy = status.outbound.configured && !status.counts.needsAttention;
  return (
    <section
      aria-labelledby="gate-connection"
      className="space-y-4 rounded-xl border border-line bg-surface p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="gate-connection" className="font-semibold">
            Inventory connection
          </h2>
          <p className="text-sm text-ink-2">
            {status.outbound.configured
              ? `Sending to ${status.outbound.host}`
              : "Not connected. Decisions are held safely until it is set up."}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-sm ${healthy ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn"}`}
        >
          {healthy ? "Healthy" : "Needs attention"}
        </span>
      </div>
      {[...status.outbound.problems, ...status.inbound.problems].length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">
          {[...status.outbound.problems, ...status.inbound.problems].map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      <dl className="grid gap-3 text-sm sm:grid-cols-4">
        {[
          ["Waiting to send", status.counts.pending],
          ["Retrying", status.counts.failed],
          ["Needs attention", status.counts.needsAttention],
          ["Delivered", status.counts.sent],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="text-ink-2">{k}</dt>
            <dd className="text-2xl font-semibold">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-ink-2">
        Last delivered: {when(status.lastDeliveredAt)}
        {status.oldestWaitingAt && ` · Oldest waiting since ${when(status.oldestWaitingAt)}`}
        {status.lastFailure &&
          ` · Last problem: ${status.lastFailure.detail}${status.lastFailure.httpStatus ? ` (HTTP ${status.lastFailure.httpStatus})` : ""}`}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={busy || !status.outbound.configured}
          onClick={() => act("/api/gate/ping", (r) => String(r.detail ?? "Connected"))}
        >
          Send test
        </Button>
        <Button
          disabled={busy || !status.outbound.configured}
          onClick={() =>
            act("/api/gate/dispatch", (r) => `Checked ${r.checked ?? 0}, delivered ${r.sent ?? 0}.`)
          }
        >
          Send waiting updates now
        </Button>
      </div>
      {note && (
        <p role="status" className="text-sm">
          {note}
        </p>
      )}
    </section>
  );
}
