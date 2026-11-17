"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
export function PatrolProvision({
  guards,
  devices,
  sites,
}: {
  guards: { id: string; name: string }[];
  devices: { id: string; name: string }[];
  sites: { id: string; name: string }[];
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  async function submit(e: React.FormEvent<HTMLFormElement>, path: string) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    setBusy(true);
    try {
      const r = await fetch(`/api/patrols/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setMessage("Saved");
      form.reset();
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }
  const input = "rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm";
  return (
    <details className="rounded-2xl border border-line bg-surface p-5">
      <summary className="cursor-pointer font-semibold">Company handsets & guard access</summary>
      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <form onSubmit={(e) => submit(e, "devices")} className="flex flex-col gap-3">
          <h3>Assign a company Android handset</h3>
          <select aria-label="Company handset" name="deviceId" required className={input}>
            <option value="">Choose an unlinked device</option>
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <select aria-label="Device site" name="locationId" required className={input}>
            <option value="">Choose a site</option>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <Button disabled={busy} type="submit">
            Assign handset to site
          </Button>
        </form>
        <form onSubmit={(e) => submit(e, "credentials")} className="flex flex-col gap-3">
          <h3>Set an individual guard PIN</h3>
          <select aria-label="Guard" name="guardId" required className={input}>
            <option value="">Choose a guard</option>
            {guards.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <input
            className={input}
            name="pin"
            type="password"
            inputMode="numeric"
            pattern="[0-9]{6,12}"
            required
            autoComplete="new-password"
            aria-label="Guard PIN"
            placeholder="6–12 digit PIN"
          />
          <Button disabled={busy} type="submit">
            Set PIN
          </Button>
          <p className="text-xs text-ink-3">
            Changing a PIN ends existing guard sessions. Give the guard their PIN privately.
          </p>
        </form>
      </div>
      <p role="status" className="mt-3 text-sm">
        {message}
      </p>
    </details>
  );
}
