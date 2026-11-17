"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SitePicker } from "@/components/map/site-picker";
import { SitePatrolSetup } from "@/components/patrols/site-patrol-setup";
import { combineDateTime, fmtShort } from "@/lib/time";
import { setupProgress } from "@/lib/patrol/setup-validation";
type Props = {
  clients: { id: string; name: string }[];
  sites: {
    id: string;
    name: string;
    latitude: number | null;
    longitude: number | null;
    checkpoints: number;
    patrolsEnabled: boolean;
  }[];
  guards: { id: string; name: string; guardNo: string; hasPin: boolean }[];
  devices: {
    id: string;
    deviceName: string;
    locationId: string | null;
    activationStatus: string;
    activationCode: string | null;
    activationExpiresAt: string | null;
    lastSeenAt: string | null;
  }[];
  shifts: { id: string; locationId: string; guardId: string; startAt: string; endAt: string }[];
  initialSiteId?: string;
  today: string;
  currentTime: string;
  localTest: boolean;
};
const input = "mt-1 w-full rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-sm";
const titles = ["Site & checkpoints", "Choose a guard", "Connect the phone", "Schedule & start"];
export function AdminSetup(p: Props) {
  const router = useRouter();
  const [step, setStep] = useState(0),
    [siteId, setSiteId] = useState(p.initialSiteId ?? p.sites[0]?.id ?? ""),
    [guardId, setGuardId] = useState(p.guards[0]?.id ?? "");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [clientId, setClientId] = useState(p.clients[0]?.id ?? ""),
    [newSite, setNewSite] = useState(!p.sites.length),
    [newGuard, setNewGuard] = useState(!p.guards.length);
  const ids = useRef<Record<string, string>>({});
  const site = p.sites.find((s) => s.id === siteId),
    guard = p.guards.find((g) => g.id === guardId);
  const phones = p.devices.filter((d) => d.locationId === siteId),
    activePhone = phones.find((d) => d.activationStatus === "ACTIVE");
  const shifts = p.shifts.filter((s) => s.locationId === siteId && s.guardId === guardId);
  const progress = setupProgress({
    site: !!site,
    checkpoints: site?.checkpoints ?? 0,
    patrolsEnabled: site?.patrolsEnabled ?? false,
    guardHasPin: guard?.hasPin ?? false,
    phoneAssigned: !!phones.length,
    phoneActivated: !!activePhone,
    shiftScheduled: !!shifts.length,
  });
  useEffect(() => {
    if (step === 2) {
      const id = setInterval(() => router.refresh(), 5000);
      return () => clearInterval(id);
    }
  }, [step, router]);
  async function save(kind: string, data: Record<string, unknown>, endpoint = "/api/setup") {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      ids.current[kind] ??= crypto.randomUUID();
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          ...(endpoint === "/api/setup" ? { kind, requestId: ids.current[kind] } : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || "Unable to save. Please try again.");
      delete ids.current[kind];
      router.refresh();
      setMessage("Saved.");
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save");
      return null;
    } finally {
      setBusy(false);
    }
  }
  const go = (i: number) => {
    setStep(i);
    setError("");
    setMessage("");
  };
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="crisis-command rounded-2xl border border-line p-6">
        <div className="relative">
          <p className="text-xs uppercase tracking-[.2em] text-ink-3">
            Crisis Security / guided setup
          </p>
          <h1 className="mt-2 text-3xl font-semibold">Get your first patrol ready</h1>
          <p className="mt-2 text-sm text-ink-2">
            Four steps. Your progress is saved as you go, so you can come back at any time.
          </p>
          {p.localTest && (
            <span className="mt-3 inline-block rounded-full bg-warn-soft px-3 py-1 text-xs text-warn">
              Local test · messages are simulated
            </span>
          )}
        </div>
      </header>
      <nav aria-label="Setup steps" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {titles.map((title, i) => (
          <button
            key={title}
            onClick={() => go(i)}
            aria-current={step === i ? "step" : undefined}
            className={`rounded-xl border p-4 text-left text-sm ${step === i ? "border-accent-bright bg-accent-soft" : "border-line bg-surface"}`}
          >
            <span
              className={`mb-2 flex h-6 w-6 items-center justify-center rounded-full text-xs ${progress.completed[i] ? "bg-ok-soft text-ok" : "bg-surface-2 text-ink-2"}`}
            >
              {progress.completed[i] ? "✓" : i + 1}
            </span>
            {title}
          </button>
        ))}
      </nav>
      <p
        role="alert"
        className={
          error
            ? "rounded-xl border border-critical/40 bg-critical-soft p-3 text-sm text-critical"
            : "sr-only"
        }
      >
        {error}
      </p>
      <p role="status" aria-live="polite" className="text-sm text-ok">
        {message}
      </p>
      {step === 0 && (
        <>
          <section className="rounded-2xl border border-line bg-surface p-5">
            <h2 className="text-lg font-semibold">1. Where will the guard patrol?</h2>
            {p.sites.length > 0 && (
              <div className="mt-4 flex flex-wrap items-end gap-3">
                <label className="min-w-0 flex-1 text-sm">
                  Choose a site
                  <select
                    className={input}
                    value={siteId}
                    onChange={(e) => {
                      setSiteId(e.target.value);
                      setNewSite(false);
                    }}
                  >
                    <option value="">Choose a site</option>
                    {p.sites.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <Button onClick={() => setNewSite(!newSite)}>
                  {newSite ? "Use existing site" : "Add a new site"}
                </Button>
              </div>
            )}
            {newSite && (
              <form
                className="mt-5 space-y-4"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  if (!fd.get("latitude") || !fd.get("longitude")) {
                    setError("Choose the site position on the map first.");
                    return;
                  }
                  const d = await save("site", {
                    name: fd.get("name"),
                    address: fd.get("address"),
                    clientId: clientId || undefined,
                    clientName: fd.get("clientName") || undefined,
                    latitude: Number(fd.get("latitude")),
                    longitude: Number(fd.get("longitude")),
                    geofenceRadiusM: Number(fd.get("radius")),
                  });
                  if (d) {
                    setSiteId(d.id);
                    setNewSite(false);
                    router.replace(`/setup?siteId=${d.id}`);
                  }
                }}
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm">
                    Site name
                    <input
                      className={input}
                      name="name"
                      required
                      placeholder="e.g. Main warehouse"
                    />
                  </label>
                  <label className="text-sm">
                    Street address
                    <input
                      className={input}
                      name="address"
                      required
                      placeholder="Where the guard reports for duty"
                    />
                  </label>
                  <label className="text-sm">
                    Client
                    <select
                      aria-label="Client"
                      className={input}
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value)}
                    >
                      <option value="">Add a new client</option>
                      {p.clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {!clientId && (
                    <label className="text-sm">
                      Client name
                      <input
                        className={input}
                        name="clientName"
                        required
                        placeholder="Company that owns this site"
                      />
                    </label>
                  )}
                </div>
                <div>
                  <h3 className="mb-2 text-sm font-medium">Place the site on the map</h3>
                  <p className="mb-3 text-xs text-ink-3">
                    Search for the address or move the pin. This is the area used to check
                    attendance.
                  </p>
                  <SitePicker
                    names={{ lat: "latitude", lng: "longitude", radius: "radius" }}
                    initial={{ lat: null, lng: null, radiusM: 150 }}
                    height={280}
                    showSource={false}
                  />
                </div>
                <Button disabled={busy} type="submit" variant="primary">
                  {busy ? "Saving…" : "Save site"}
                </Button>
              </form>
            )}
          </section>
          {site && (
            <SitePatrolSetup
              key={site.id}
              siteId={site.id}
              editable
              localTest={p.localTest}
              latitude={site.latitude}
              longitude={site.longitude}
            />
          )}
          <div className="flex justify-end">
            <Button disabled={!progress.completed[0]} onClick={() => go(1)} variant="primary">
              Next: choose a guard →
            </Button>
          </div>
        </>
      )}
      {step === 1 && (
        <section className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="text-lg font-semibold">2. Who will use the phone?</h2>
          <p className="mt-2 text-sm text-ink-2">
            Each guard signs in with their own guard number and PIN, even when the phone is shared.
          </p>
          {!site && <p className="mt-4 text-warn">Choose a site in step 1 first.</p>}
          {p.guards.length > 0 && (
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <label className="min-w-0 flex-1 text-sm">
                Guard
                <select
                  className={input}
                  value={guardId}
                  onChange={(e) => {
                    setGuardId(e.target.value);
                    setNewGuard(false);
                  }}
                >
                  <option value="">Choose a guard</option>
                  {p.guards.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} · {g.guardNo}
                    </option>
                  ))}
                </select>
              </label>
              <Button onClick={() => setNewGuard(!newGuard)}>
                {newGuard ? "Use existing guard" : "Add a guard"}
              </Button>
            </div>
          )}
          {newGuard && site && (
            <form
              className="mt-5 grid gap-4 sm:grid-cols-2"
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget,
                  data = Object.fromEntries(new FormData(form));
                const d = await save("guard", { ...data, locationId: site.id });
                if (d) {
                  form.reset();
                  setGuardId(d.id);
                  setNewGuard(false);
                  setMessage(
                    `Guard created. Their sign-in number is ${d.guardNo}. Give them the PIN privately.`,
                  );
                }
              }}
            >
              {[
                ["firstName", "First name"],
                ["lastName", "Last name"],
                ["phone", "Personal phone number"],
                ["nationalId", "National ID"],
              ].map(([name, label]) => (
                <label key={name} className="text-sm">
                  {label}
                  <input
                    className={input}
                    name={name}
                    required
                    type={name === "phone" ? "tel" : "text"}
                  />
                </label>
              ))}
              <label className="text-sm">
                Gender
                <select name="gender" className={input} defaultValue="OTHER">
                  <option value="OTHER">Other / not specified</option>
                  <option value="MALE">Male</option>
                  <option value="FEMALE">Female</option>
                </select>
              </label>
              <label className="text-sm">
                Guard PIN
                <input
                  className={input}
                  name="pin"
                  type="password"
                  inputMode="numeric"
                  autoComplete="new-password"
                  pattern="[0-9]{6,12}"
                  required
                  placeholder="Choose 6–12 digits"
                />
              </label>
              <Button type="submit" disabled={busy} variant="primary">
                Save guard & PIN
              </Button>
            </form>
          )}
          {!newGuard && guard && (
            <div className="mt-5">
              <p className="rounded-xl bg-surface-2 p-4 text-sm">
                Guard number: <strong className="select-all">{guard.guardNo}</strong> ·{" "}
                {guard.hasPin ? "PIN is set" : "PIN needed"}
              </p>
              <details className="mt-4" open={!guard.hasPin}>
                <summary className="cursor-pointer text-sm">
                  {guard.hasPin ? "Change this guard’s PIN" : "Set their sign-in PIN"}
                </summary>
                <form
                  className="mt-3 flex flex-wrap items-end gap-3"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    const d = await save(
                      "pin",
                      { guardId: guard.id, pin: new FormData(form).get("pin") },
                      "/api/patrols/credentials",
                    );
                    if (d) {
                      form.reset();
                      setMessage("PIN saved. Give it to the guard privately.");
                    }
                  }}
                >
                  <label className="text-sm">
                    New PIN
                    <input
                      className={input}
                      type="password"
                      name="pin"
                      pattern="[0-9]{6,12}"
                      inputMode="numeric"
                      required
                      autoComplete="new-password"
                    />
                  </label>
                  <Button disabled={busy} type="submit">
                    Save PIN
                  </Button>
                </form>
              </details>
            </div>
          )}
          <div className="mt-6 flex justify-between">
            <Button onClick={() => go(0)}>← Back</Button>
            <Button disabled={!guard?.hasPin || !site} onClick={() => go(2)} variant="primary">
              Next: connect the phone →
            </Button>
          </div>
        </section>
      )}
      {step === 2 && (
        <section className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="text-lg font-semibold">3. Connect the company phone</h2>
          <p className="mt-2 text-sm text-ink-2">
            Register the phone once. The next guard can use the same phone by signing in with their
            own PIN.
          </p>
          {phones.map((d) => (
            <div key={d.id} className="mt-4 rounded-xl border border-line p-4">
              <div className="flex flex-wrap justify-between gap-2">
                <h3 className="font-medium">{d.deviceName}</h3>
                <span
                  className={`text-sm ${d.activationStatus === "ACTIVE" ? "text-ok" : "text-warn"}`}
                >
                  {d.activationStatus === "ACTIVE" ? "✓ Phone connected" : "Waiting for activation"}
                </span>
              </div>
              {d.activationStatus !== "ACTIVE" && (
                <>
                  <p className="mt-3 text-sm">
                    On the phone, open Crisis Security and enter this activation code:
                  </p>
                  <p className="my-3 select-all font-mono text-3xl tracking-[.2em]">
                    {d.activationCode ?? "Code needed"}
                  </p>
                  {d.activationExpiresAt && new Date(d.activationExpiresAt) < new Date() ? (
                    <p className="text-sm text-warn">
                      This code expired.{" "}
                      <Link className="underline" href={`/gateways/${d.id}`}>
                        Get a fresh code
                      </Link>
                      .
                    </p>
                  ) : (
                    <p className="text-xs text-ink-3">
                      The code is valid until{" "}
                      {fmtShort(d.activationExpiresAt ? new Date(d.activationExpiresAt) : null)}.
                    </p>
                  )}
                </>
              )}
            </div>
          ))}
          {!phones.length && site && (
            <form
              className="mt-5 grid gap-4 sm:grid-cols-2"
              onSubmit={async (e) => {
                e.preventDefault();
                const d = await save("handset", {
                  ...Object.fromEntries(new FormData(e.currentTarget)),
                  locationId: site.id,
                });
                if (d)
                  setMessage("Phone registered. Enter its activation code in the Android app.");
              }}
            >
              <label className="text-sm">
                Phone name
                <input
                  className={input}
                  name="deviceName"
                  required
                  defaultValue={`${site.name} phone`}
                />
              </label>
              <label className="text-sm">
                Phone SIM number
                <input
                  className={input}
                  type="tel"
                  name="phoneNumber"
                  required
                  placeholder="e.g. 0772 123 456"
                />
              </label>
              <Button variant="primary" disabled={busy} type="submit">
                Get activation code
              </Button>
            </form>
          )}
          {p.localTest && (
            <p className="mt-5 rounded-xl bg-surface-2 p-4 text-sm">
              USB test: use the supplied local-test APK. Keep the phone plugged in and allow USB
              debugging when Android asks. I’ll check the connection and link it to this local
              server.
            </p>
          )}
          {!site && <p className="mt-4 text-warn">Choose a site in step 1 first.</p>}
          <div className="mt-6 flex justify-between">
            <Button onClick={() => go(1)}>← Back</Button>
            <Button disabled={!site || !phones.length} variant="primary" onClick={() => go(3)}>
              Next: schedule the shift →
            </Button>
          </div>
        </section>
      )}
      {step === 3 && (
        <section className="rounded-2xl border border-line bg-surface p-5">
          <h2 className="text-lg font-semibold">4. Schedule the guard, then start</h2>
          <p className="mt-2 text-sm text-ink-2">
            {guard?.name ?? "Choose a guard"} at {site?.name ?? "your site"}. The guard can sign in
            during the scheduled hours.
          </p>
          {shifts.map((s) => (
            <Link
              key={s.id}
              href={`/shifts/${s.id}`}
              className="mt-4 block rounded-xl border border-line p-4 text-sm"
            >
              ✓ Shift scheduled: {fmtShort(new Date(s.startAt))} – {fmtShort(new Date(s.endAt))} ↗
            </Link>
          ))}
          {site && guard && !shifts.length && (
            <form
              className="mt-5 grid gap-4 sm:grid-cols-3"
              onSubmit={async (e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const start = combineDateTime(String(fd.get("date")), String(fd.get("start")));
                let end = combineDateTime(String(fd.get("date")), String(fd.get("end")));
                if (end <= start) end = new Date(+end + 86400000);
                await save("shift", {
                  guardId: guard.id,
                  locationId: site.id,
                  startAt: start.toISOString(),
                  endAt: end.toISOString(),
                });
              }}
            >
              <label className="text-sm">
                Date
                <input type="date" name="date" className={input} required defaultValue={p.today} />
              </label>
              <label className="text-sm">
                Starts
                <input
                  type="time"
                  name="start"
                  className={input}
                  required
                  defaultValue={p.currentTime}
                />
              </label>
              <label className="text-sm">
                Ends
                <input type="time" name="end" className={input} required />
              </label>
              <p className="text-xs text-ink-3 sm:col-span-3">
                Times use Harare / Johannesburg time. An end earlier than the start means the next
                morning.
              </p>
              <Button type="submit" disabled={busy || !progress.completed[0]} variant="primary">
                Save shift
              </Button>
            </form>
          )}
          <div className="mt-6 rounded-xl bg-surface-2 p-5">
            <h3 className="font-semibold">
              {progress.ready ? "✓ Ready for the test run" : "Before the guard signs in"}
            </h3>
            <ul className="mt-3 space-y-2 text-sm text-ink-2">
              {[
                "Site, QR checkpoint and patrol timing saved",
                "Individual guard PIN set",
                "Company phone activated",
                "Shift scheduled",
              ].map((label, i) => (
                <li key={label}>
                  {progress.completed[i] ? "✓" : "○"} {label}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-sm">
              Open Patrol command on the phone, enter{" "}
              <strong>{guard?.guardNo ?? "the guard number"}</strong> and the guard’s PIN, then wait
              for the first checkpoint prompt.
            </p>
            <p className="mt-2 text-xs text-ink-3">
              A saved scan may still need GPS review. Confirm the result in Patrol command before
              counting it as completed.
            </p>
          </div>
          <div className="mt-6 flex flex-wrap justify-between gap-3">
            <Button onClick={() => go(2)}>← Back</Button>
            <Link
              href={site ? `/patrols?siteId=${site.id}` : "/patrols"}
              className="rounded-lg bg-accent-gradient px-4 py-2 text-sm"
            >
              Open patrol command →
            </Link>
          </div>
        </section>
      )}
      <footer className="flex flex-wrap items-center justify-between gap-3 text-xs text-ink-3">
        <span>
          {progress.completed.filter(Boolean).length} of 4 steps complete for this site and guard
        </span>
        <Link href="/dashboard" className="underline">
          Back to dashboard
        </Link>
      </footer>
    </div>
  );
}
