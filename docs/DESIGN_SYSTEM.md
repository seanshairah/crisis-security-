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
Note the phone still *receives* every window in its session config (it needs them to validate scans offline); the UI hides them, but a rooted
phone could read them. Moving window delivery to just-in-time push would close that and is the follow-up if the threat model includes guards
pre-positioning for a known time.

## Not done from the handoff

- **Shift handover view** (dashboard v2): needs a data model for handover notes and per-item owners on shifts; the queue shows owners only where the
  data exists (alert acknowledgement).
- The remaining list pages keep their existing tables and filters; they pick up the new tokens, serif titles and pill controls, but the four summary
  tiles + filter-chip + footer pattern was not rebuilt page by page.
- Android screens other than the patrol screen keep their existing layouts and pick up the new palette, shapes and serif title; the scan-result,
  emergency hold-ring and delivery-trail screens were not rebuilt.
- Map components are untouched (handoff: restyle chrome only).
- Paparazzi snapshot images under `android/app/src/test/snapshots` predate the redesign; re-record with `./gradlew -Pscreenshots :app:recordPaparazziDebug`.
