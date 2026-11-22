"use client";
import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import type { GateDetails } from "@/lib/gate/contract";
import QRCode from "qrcode";
import { GateConnection, type ConnectionStatus } from "@/components/gate-connection";
const approvalLabel: Record<string, string> = {
  PENDING: "Awaiting physical check",
  REVIEW: "Needs supervisor review",
  APPROVED: "Cleared at gate",
  REJECTED: "Not cleared",
  CANCELLED: "Withdrawn by inventory",
};
const syncLabel: Record<string, string> = {
  PENDING: "Waiting to send",
  SENDING: "Sending",
  SENT: "Received by inventory",
  FAILED: "Retry pending",
  NOT_QUEUED: "Not queued",
};
type Movement = {
  id: string;
  sourceReference: string;
  direction: string;
  status: string;
  version: number;
  locationId: string;
  location: { name: string };
  expected: GateDetails | null;
  observed: GateDetails | null;
  reason: string | null;
  createdAt: string;
  deliveries: { status: string; lastError: string | null; deadAt?: string | null }[];
};
type History = { actor: string; action: string; createdAt: string };
function Details({ title, d }: { title: string; d: GateDetails | null }) {
  return (
    <section className="rounded-xl border border-line p-4">
      <h3 className="font-semibold">{title}</h3>
      {d ? (
        <>
          <p className="mt-2">
            {d.party} · {d.place}
          </p>
          <p className="text-sm text-ink-2">
            {new Date(d.occurredAt).toLocaleString()} · {d.vehicleType} {d.registration}
          </p>
          <ul className="my-3 space-y-2">
            {d.items.map((i, n) => (
              <li key={n}>
                <strong>
                  {i.quantity} {i.unit}
                </strong>{" "}
                · {i.name}
                <p className="text-sm text-ink-2">{i.description}</p>
              </li>
            ))}
          </ul>
          <p className="text-sm">{d.note}</p>
        </>
      ) : (
        <p className="mt-2 text-ink-2">No physical check recorded yet.</p>
      )}
    </section>
  );
}
export function GateInventory({
  sites,
  items,
  admin,
  connection,
}: {
  sites: { id: string; name: string; guardCanApprove: boolean }[];
  items: Movement[];
  admin: boolean;
  connection?: ConnectionStatus;
}) {
  const router = useRouter();
  const [site, setSite] = useState("");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [selected, setSelected] = useState<Movement | null>(null);
  const [history, setHistory] = useState<History[]>([]);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [amend, setAmend] = useState<GateDetails | null>(null);
  const [qr, setQr] = useState("");
  async function request(url: string, data?: unknown) {
    const r = await fetch(
      url,
      data
        ? {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(data),
          }
        : undefined,
    );
    const b = await r.json();
    if (!r.ok) throw Error(b.error ?? "Unable to complete this action");
    return b;
  }
  async function open(m: Movement) {
    setBusy(true);
    setMessage("");
    try {
      const b = await request(`/api/gate/movements/${m.id}`);
      setSelected({ ...m, ...b });
      setHistory(b.history);
      setReason("");
      setAmend(null);
      setQr(await QRCode.toDataURL(`GM1:${m.id}`, { width: 240, margin: 2 }));
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function decide(decision: string) {
    if (!selected) return;
    setBusy(true);
    setMessage("");
    try {
      await request(`/api/gate/movements/${selected.id}`, {
        version: selected.version,
        decision,
        reason,
      });
      setSelected(null);
      router.refresh();
      setMessage(
        decision === "RETRY"
          ? "Retry queued."
          : "Decision recorded. Delivery to the inventory system is queued.",
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const visible = items.filter(
    (m) =>
      (!site || m.locationId === site) &&
      (filter === "ALL" ||
        (filter === "SYNC_FAILED"
          ? m.deliveries[0]?.status === "FAILED"
          : ["PENDING", "REVIEW"].includes(m.status))) &&
      JSON.stringify([m.sourceReference, m.expected?.registration, m.observed?.registration])
        .toLowerCase()
        .includes(q.toLowerCase()),
  );
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="font-display text-4xl">Gate Inventory</h1>
        <p className="mt-2 text-ink-2">
          Review physical checks, clear movements and follow delivery to your inventory system.
        </p>
      </header>
      {admin && connection && <GateConnection status={connection} />}
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          [
            "Awaiting a decision",
            items.filter((m) => ["PENDING", "REVIEW"].includes(m.status)).length,
          ],
          ["Cleared at gate", items.filter((m) => m.status === "APPROVED").length],
          [
            "Delivery needs attention",
            items.filter((m) => m.deliveries[0]?.status === "FAILED" || m.deliveries[0]?.deadAt)
              .length,
          ],
        ].map(([label, count]) => (
          <div key={label} className="rounded-xl border border-line bg-surface p-4">
            <p className="text-sm text-ink-2">{label}</p>
            <strong className="text-3xl">{count}</strong>
          </div>
        ))}
      </div>
      {message && (
        <p role="status" className="rounded-xl border border-line p-4">
          {message}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Site">
          <Select value={site} onChange={(e) => setSite(e.target.value)}>
            <option value="">All assigned sites</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="View">
          <Select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="ALL">Recent activity</option>
            <option value="PENDING">Pending review</option>
            <option value="SYNC_FAILED">Sync failures</option>
          </Select>
        </Field>
        <Field label="Find movement">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Reference or vehicle registration"
          />
        </Field>
      </div>
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-2">
            <tr>
              {["Movement", "Site", "Gate approval", "Inventory sync", ""].map((s, i) => (
                <th key={i} className="p-3">
                  {s}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((m) => (
              <tr key={m.id} className="border-t border-line">
                <td className="p-3">
                  {m.direction}
                  <p className="text-xs text-ink-2">{m.sourceReference}</p>
                </td>
                <td className="p-3">{m.location.name}</td>
                <td className="p-3">{approvalLabel[m.status] ?? m.status}</td>
                <td className="p-3">{syncLabel[m.deliveries[0]?.status ?? "NOT_QUEUED"]}</td>
                <td className="p-3">
                  <Button disabled={busy} onClick={() => open(m)}>
                    Review
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!visible.length && (
          <p className="p-6 text-ink-2">
            No matching movements. Guards can record arrivals and departures in the app.
          </p>
        )}
      </div>
      {selected && (
        <section className="space-y-4 rounded-xl border border-line bg-surface p-5">
          <div className="flex justify-between gap-4">
            <h2 className="text-xl font-semibold">
              {selected.direction} · {selected.sourceReference}
            </h2>
            <Button onClick={() => setSelected(null)}>Close</Button>
          </div>
          <p>
            Gate: {approvalLabel[selected.status]} · Inventory:{" "}
            {syncLabel[selected.deliveries[0]?.status ?? "NOT_QUEUED"]}
          </p>
          {selected.reason && <p>{selected.reason}</p>}
          <div className="grid gap-4 md:grid-cols-2">
            <Details title="Submitted details" d={selected.expected} />
            <Details title="Guard’s physical check" d={selected.observed} />
          </div>
          {selected.deliveries[0]?.lastError && (
            <p role="alert">{selected.deliveries[0].lastError}</p>
          )}
          {selected.observed && ["PENDING", "REVIEW"].includes(selected.status) && (
            <>
              <Field label="Decision reason">
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} required />
              </Field>
              <div className="flex gap-3">
                <Button
                  disabled={busy || !reason.trim()}
                  variant="primary"
                  onClick={() => decide("APPROVED")}
                >
                  Approve movement
                </Button>
                <Button
                  disabled={busy || !reason.trim()}
                  variant="danger"
                  onClick={() => decide("REJECTED")}
                >
                  Reject movement
                </Button>
              </div>
            </>
          )}
          {selected.deliveries[0]?.status === "FAILED" && (
            <Button disabled={busy} onClick={() => decide("RETRY")}>
              Retry delivery
            </Button>
          )}
          {["APPROVED", "REJECTED"].includes(selected.status) && !amend && (
            <Button
              onClick={() => setAmend(structuredClone(selected.observed ?? selected.expected!))}
            >
              Create audited correction
            </Button>
          )}
          {amend && (
            <section className="space-y-3 rounded-xl border border-line p-4">
              <h3 className="font-semibold">Correction · new approval required</h3>
              <p className="text-sm text-ink-2">The original record stays unchanged.</p>
              {(
                [
                  ["party", "Supplier / person"],
                  ["place", "Origin / destination"],
                  ["registration", "Vehicle registration"],
                  ["note", "Note"],
                ] as const
              ).map(([k, label]) => (
                <Field key={k} label={label}>
                  <Input
                    value={amend[k]}
                    onChange={(e) => setAmend({ ...amend, [k]: e.target.value })}
                  />
                </Field>
              ))}
              {amend.items.map((item, index) => (
                <div key={index} className="grid gap-2 sm:grid-cols-3">
                  <Field label="Item">
                    <Input
                      value={item.name}
                      onChange={(e) =>
                        setAmend({
                          ...amend,
                          items: amend.items.map((i, n) =>
                            n === index ? { ...i, name: e.target.value } : i,
                          ),
                        })
                      }
                    />
                  </Field>
                  <Field label="Quantity">
                    <Input
                      type="number"
                      min="0.001"
                      step="any"
                      value={item.quantity}
                      onChange={(e) =>
                        setAmend({
                          ...amend,
                          items: amend.items.map((i, n) =>
                            n === index ? { ...i, quantity: Number(e.target.value) } : i,
                          ),
                        })
                      }
                    />
                  </Field>
                  <Field label="Unit">
                    <Input
                      value={item.unit}
                      onChange={(e) =>
                        setAmend({
                          ...amend,
                          items: amend.items.map((i, n) =>
                            n === index ? { ...i, unit: e.target.value } : i,
                          ),
                        })
                      }
                    />
                  </Field>
                </div>
              ))}
              <Field label="Correction reason">
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} />
              </Field>
              <Button
                disabled={busy || !reason.trim()}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await request(`/api/gate/movements/${selected.id}/correction`, {
                      details: amend,
                      reason,
                    });
                    setSelected(null);
                    setAmend(null);
                    router.refresh();
                    setMessage("Correction saved for review. The original movement is unchanged.");
                  } catch (e) {
                    setMessage((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Save correction for review
              </Button>
            </section>
          )}
          <div>
            <h3 className="font-semibold">Movement QR</h3>
            <p className="text-sm text-ink-2">
              Opens this record for review. Scanning does not approve it.
            </p>
            {qr && (
              <Image
                src={qr}
                alt="Movement reference QR code"
                width={240}
                height={240}
                unoptimized
              />
            )}
          </div>
          <h3 className="font-semibold">Activity history</h3>
          <ul className="space-y-2 text-sm">
            {history.map((h, i) => (
              <li key={i}>
                {new Date(h.createdAt).toLocaleString()} · {h.actor} ·{" "}
                {h.action.startsWith("COMMAND:") ? "Physical check recorded" : h.action}
              </li>
            ))}
          </ul>
        </section>
      )}
      {admin && (
        <details className="rounded-xl border border-line bg-surface p-4">
          <summary className="cursor-pointer font-semibold">Site approval permissions</summary>
          <p className="my-3 text-sm text-ink-2">
            Differences always go to a supervisor. By default all movements require supervisor
            approval.
          </p>
          {sites.map((s) => (
            <label key={s.id} className="flex items-center gap-3 py-2">
              <input
                type="checkbox"
                defaultChecked={s.guardCanApprove}
                disabled={busy}
                onChange={async (e) => {
                  const target = e.target;
                  setBusy(true);
                  try {
                    await request("/api/gate/policy", {
                      locationId: s.id,
                      guardCanApprove: target.checked,
                    });
                    router.refresh();
                  } catch (err) {
                    target.checked = !target.checked;
                    setMessage((err as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              />{" "}
              Allow guards at {s.name} to approve matching movements
            </label>
          ))}
        </details>
      )}
    </div>
  );
}
