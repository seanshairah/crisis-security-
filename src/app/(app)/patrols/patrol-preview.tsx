'use client';

import { useMemo, useState } from 'react';

type Point = { id: string; name: string; priority: number; visits: number };
type PatrolAction = { id: string; pointId: string; guard: string; occurredAt: string; source: 'DEMO'; note: string };
const initial: Point[] = [
  { id: 'gate', name: 'Main Gate', priority: 3, visits: 0 },
  { id: 'fence', name: 'Northern Fence', priority: 4, visits: 0 },
  { id: 'loading', name: 'Loading Bay', priority: 3, visits: 0 },
  { id: 'rear', name: 'Rear Entrance', priority: 4, visits: 0 },
  { id: 'corner', name: 'Perimeter Corner', priority: 2, visits: 0 },
];

/** UI-only simulator: never used to assert actual attendance, location or a physical QR scan. */
export function PatrolPreview() {
  const [points, setPoints] = useState<Point[]>(initial);
  const [events, setEvents] = useState<PatrolAction[]>([]);
  const [guard, setGuard] = useState('Guard A');
  const [device] = useState('CRISIS-COMPANY-001');
  const [offline, setOffline] = useState(false);
  const [nextDue, setNextDue] = useState<number|null>(null);
  const [assigned, setAssigned] = useState<string|null>(null);
  const [draftName, setDraftName] = useState('');
  const covered = points.filter(p => p.visits > 0).length;
  const remaining = useMemo(() => points.filter(p => p.visits === 0), [points]);

  function assign() {
    const pool = remaining.length ? remaining : points;
    if (!pool.length) return;
    const peak = Math.max(...pool.map(p => p.priority));
    const candidates = pool.filter(p => p.priority === peak);
    const chosen = candidates[Math.floor(Math.random() * candidates.length)];
    const randomDelayMinutes = 10 + Math.floor(Math.random() * 26);
    setAssigned(chosen.id);
    setNextDue(Date.now() + randomDelayMinutes * 60000);
  }
  function simulateScan() {
    if (!assigned) return;
    const point = points.find(p => p.id === assigned);
    if (!point) return;
    setPoints(old => old.map(p => p.id === assigned ? {...p,visits:p.visits+1} : p));
    setEvents(old => [{id:`demo-${old.length+1}`,pointId:assigned,guard,occurredAt:new Date().toISOString(),source:'DEMO',note:offline?'Simulated locally; not queued or uploaded':'Simulated online; not sent to backend'},...old]);
    setAssigned(null); setNextDue(null);
  }
  function addPoint() {
    const name = draftName.trim();
    if (!name || name.length > 70 || points.length >= 30) return;
    const id = `preview-${points.length}-${Date.now()}`;
    setPoints(old => [...old,{id,name,priority:2,visits:0}]); setDraftName('');
  }
  function handover() { setGuard(g => g === 'Guard A' ? 'Guard B' : 'Guard A'); setAssigned(null);setNextDue(null); }
  return (
    <main className="space-y-5 pb-10">
      <header className="rounded-xl border border-line bg-surface p-5 sm:p-7">
        <p className="mb-1 text-xs font-bold uppercase tracking-[.2em] text-ink-3">Crisis Security • Patrol Command</p>
        <h1 className="text-2xl font-bold tracking-tight text-ink">Patrol Management</h1>
        <p className="mt-2 max-w-3xl text-sm text-ink-2">Set up checkpoints, assess coverage and preview shared-device patrol handovers.</p><a className="mt-3 inline-flex rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm font-semibold text-ink hover:bg-slate-700" href="/crisis-preview/" target="_blank" rel="noreferrer">Open interactive Crisis Command preview ↗</a>
        <div role="status" className="mt-4 rounded-lg border border-amber-400/40 bg-amber-100/40 p-3 text-sm text-ink">
          <strong>DEVELOPMENT PREVIEW — NO LIVE RECORDS.</strong> Actions below are simulated in memory. No QR codes are issued, no guards are authenticated, no scans are verified, and no data is saved or uploaded.
        </div>
      </header>
      <section className="grid gap-4 md:grid-cols-3" aria-label="Preview metrics">
        {[
          ['Site checkpoints',String(points.length),'Illustrative warehouse site'],
          ['Visited points',`${covered} / ${points.length}`,'Simulated coverage only'],
          ['Activity entries',String(events.length),'Not persisted'],
        ].map(([title,value,note]) => <div key={title} className="rounded-xl border border-line bg-surface p-5"><p className="text-sm text-ink-2">{title}</p><p className="mt-2 text-3xl font-bold text-ink">{value}</p><p className="text-xs text-ink-3">{note}</p></div>)}
      </section>
      <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
        <section className="rounded-xl border border-line bg-surface p-5">
          <h2 className="text-lg font-semibold text-ink">Site checkpoints</h2>
          <p className="mt-1 text-sm text-ink-2">Demo site • High-priority, uncovered points are selected first.</p>
          <ul className="mt-4 space-y-2">{points.map((p,i) => <li key={p.id} className="flex items-center justify-between gap-3 rounded-lg border border-line p-3"><div className="flex min-w-0 items-center gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-bold text-ink">{i+1}</span><div><p className="font-medium text-ink">{p.name}</p><p className="text-xs text-ink-3">Priority {p.priority} • {p.visits} simulated visits</p></div></div><span className={`rounded-md px-2 py-1 text-xs font-medium ${p.visits?'bg-emerald-100 text-emerald-900':'bg-surface-2 text-ink-2'}`}>{p.visits?'Visited':'Pending'}</span></li>)}</ul>
          <div className="mt-4 flex flex-wrap gap-2"><input aria-label="New demo checkpoint" value={draftName} onChange={e=>setDraftName(e.target.value)} maxLength={70} placeholder="Checkpoint name" className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"/><button onClick={addPoint} disabled={!draftName.trim()||points.length>=30} className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Add demo point</button></div>
        </section>
        <div className="space-y-5">
          <section className="rounded-xl border border-line bg-surface p-5">
            <h2 className="text-lg font-semibold text-ink">Company device and handover</h2>
            <p className="mt-2 text-xs uppercase tracking-wider text-ink-3">{device}</p>
            <p className="mt-1 text-base font-semibold text-ink">Current preview identity: {guard}</p>
            <button onClick={handover} className="mt-3 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-ink hover:bg-surface-2">Simulate guard handover</button>
            <p className="mt-2 text-xs text-ink-3">Real handover will require a secure PIN and a separate session per guard; this preview does not log anyone in.</p>
          </section>
          <section className="rounded-xl border border-line bg-surface p-5">
            <h2 className="text-lg font-semibold text-ink">Random patrol preview</h2>
            <label className="mt-3 flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={offline} onChange={e=>setOffline(e.target.checked)}/> Simulate offline mode</label>
            <p className="mt-2 text-sm text-ink-2">Both modes use a random 10–35-minute window. Actual Android alerts and offline storage require device integration.</p>
            <button onClick={assign} disabled={!!assigned} className="mt-4 w-full rounded-lg bg-slate-700 px-4 py-3 font-semibold text-white disabled:opacity-50">Generate demo patrol task</button>
            {assigned && <div className="mt-3 rounded-lg border border-line bg-surface-2 p-4"><p className="text-xs text-ink-3">Assigned checkpoint</p><p className="font-semibold text-ink">{points.find(p=>p.id===assigned)?.name}</p><p className="mt-1 text-sm text-ink-2">Random due time: {nextDue ? new Date(nextDue).toLocaleTimeString():'—'}</p><button onClick={simulateScan} className="mt-3 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-semibold text-ink">Simulate scan event</button><p className="mt-1 text-xs text-ink-3">Not an actual camera/QR scan</p></div>}
          </section>
        </div>
      </div>
      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="text-lg font-semibold text-ink">Preview patrol timeline</h2>
        {!events.length ? <p className="mt-3 text-sm text-ink-3">No simulated events yet. Generate a task and simulate a scan to view history.</p>:<ul className="mt-3 space-y-2">{events.map(ev=><li key={ev.id} className="rounded-lg border border-line p-3 text-sm"><div className="font-medium text-ink">{ev.guard} • {points.find(p=>p.id===ev.pointId)?.name} • DEMO</div><div className="text-xs text-ink-3">{new Date(ev.occurredAt).toLocaleString()} — {ev.note}</div></li>)}</ul>}
      </section>
    </main>
  );
}
