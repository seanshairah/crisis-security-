# Design system (portal and guard app)

Source: the "Crisis Guard App / Control Dashboard v2" design handoff. Behaviour, routes and data are unchanged; this is look and layout.

## Tokens

Colour roles are CSS variables in `src/app/globals.css` (portal) and `res/values[-night]/colors.xml` (Android). Components use roles
(`bg-surface`, `text-ink-2`, `border-line`, `text-ok`, `bg-critical-solid`), never hex values, so a theme is a set of variable values.

| Role | Dark | Light |
| --- | --- | --- |
| page / surface / surface-2 | `#141311` / `#1b1a17` / `#201d19` | `#f6f2ec` / `#ffffff` / `#f1ebe1` |
| line | `#2a2620` | `#e3dccf` |
| ink / ink-2 / ink-3 | `#f4efe8` / `#b5ab9d` / `#8d8578` | `#1c1915` / `#6b6358` / `#8a8173` |
| accent (gradient `#f0a35a` → `#c97221`, text `#1a1008`) | same | same |
| ok / warn / critical (text) | `#7fd17a` / `#f0b24a` / `#f08a7a` | `#3d8f3a` / `#a8720f` / `#c0392b` |

Rules carried over from the handoff and the codebase: green is *verified*, never the brand accent; amber is waiting or saved offline;
red is emergency or exception and is **never used for "unknown"**; every status pairs an icon or word with its colour.

Type: Instrument Serif italic for screen titles and the greeting, Figtree for everything else (see `docs/FONTS.md`). Radii: cards 24, rows 18-20,
buttons and pills fully rounded. Touch targets are at least 44 px (48 dp on Android).

## Themes

- Portal: follows the system preference; the account menu toggles light/dark and remembers the choice (`localStorage["crisis-theme"]`,
  applied before first paint by a one-line script in `src/app/layout.tsx`).
- Android: `Theme.Material3.DayNight`; the system setting decides. Status-bar icon contrast flips through `@bool/light_system_bars`.

## What changed where

- Portal: `globals.css` tokens, `ui/button` (pill, gradient primary), `ui/status`, `ui/page` (serif titles), sidebar (240 px, user chip), topbar
  (theme toggle), login, and the dashboard: greeting, **Needs you now** (ranked by `src/lib/dashboard/queue.ts`, with owner and one action per row),
  tinted KPI cards, attendance ring, calm state.
- Android: colour/theme/button/card resources, `Display` serif title style, patrol screen colours from theme resources.

## Randomised checks (rule from the handoff)

Guards must not see the patrol schedule in advance. The guard app shows a check only while its window is open (countdown to close) and otherwise
says "Next check: at a random time. We will alert you." Operations see the assigned windows in Patrol command.
By default the phone still *receives* every window in its session config (it needs them to prompt and to check scans while offline); the UI hides
them, but a rooted phone could read them. Set `PATROL_WINDOW_LOOKAHEAD_MINUTES` (5-240) to stop the server sending windows that open further
ahead than that (`src/lib/patrol/reveal.ts`). The cost is offline resilience: a phone that loses its connection for longer than the look-ahead has
no window to prompt from until it syncs again. It is off by default; enable it per deployment once your coverage gaps are known.

## Added after the first pass

- **Shift handover**: tables `AttentionClaim`, `Handover`, `HandoverNote`; `/handover` page; "Take it / Release" on the queue. First claim wins, only the
  owner or an admin releases, a handover moves the outgoing operator's claims in one transaction and freezes what was open. Guard alerts keep their owner
  in `acknowledgedBy`. Covered by `npm run test:handover`.
- **List pages**: four summary tiles (`SummaryTiles`, figures in `src/lib/list-summaries.ts`) above Guards, Shifts, Incidents, Guard alerts and Devices.
- **Android emergency**: hold-to-send ring (`HoldRingView`, 2 s, drains back if released; TalkBack users keep the confirm dialog), then an "Emergency sent"
  screen with the delivery trail Saved / Received / Acknowledged driven by the outbox status. The alert is **never delayed**; the handoff's 5 s "undo" is
  implemented as "Sent by mistake? Tell operations", which sends a message and does not retract the alert, because there is no server-side cancel and a
  delayed emergency is the wrong trade.
- **Android scan result**: verified / saved / problem screen with distance (inside or outside the fence) and GPS accuracy against the 50 m limit. It does
  not show the next check time, by the randomised-check rule.
- **Screenshots**: `Record Android screenshots` workflow (run by hand) uploads freshly rendered snapshots to commit after a visual change.

## Not done

- Remaining list pages (Clients, Sites, Message logs, Templates, Calls, Reports, Users, Audit) get the tokens, serif titles and pill controls but no summary tiles yet.
- Android screens other than patrol, scan result and emergency keep their layouts and pick up the palette, shapes and serif title.
- The snapshot images in `android/app/src/test/snapshots` are still the old look until someone runs the workflow above and commits its output.
- Map components are untouched (handoff: restyle chrome only).
