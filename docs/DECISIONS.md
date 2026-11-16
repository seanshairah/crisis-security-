# Decisions

Short records of choices made while applying the design handoff and closing the code review, with the reason and what would change them.

## 1. An emergency is never delayed; "undo" is a message, not a retraction

- **Context.** The handoff shows an emergency sent with a 5 second undo. The app's own rule (`AlertSender`) is that an emergency never waits.
- **Decision.** The alert goes out the instant the 2 second hold completes. For five seconds the guard sees "Sent by mistake? Tell operations", which sends a
  status message asking operations to confirm by phone. It does not retract the alert, and operations still checks on the guard.
- **Why.** Holding an emergency back for 5 seconds so it can be cancelled trades a real emergency's speed for a rare accident, and the hold gesture already
  guards against accidents. There is also no server-side cancel to call.
- **Would change if.** Operations wants true cancellation. That needs a guard-cancel endpoint, a `CANCELLED_BY_GUARD` alert status, an audit trail and a
  rule for what operations sees; do it as a server change first, then add the button.

## 2. Patrol window look-ahead ships off

- **Context.** The guard app hides future patrol windows, but the phone still receives the whole session plan, so a rooted phone could read it.
- **Decision.** `PATROL_WINDOW_LOOKAHEAD_MINUTES` exists (5 to 240, `src/lib/patrol/reveal.ts`) and is **unset by default**. Unset keeps today's behaviour.
- **Why.** Withholding windows costs offline resilience: a phone offline for longer than the look-ahead has nothing to prompt from until it syncs. That
  trade-off depends on real coverage at each site, which has not been measured, and the guard app has not been field-tested with it on.
- **Rollout recommendation.** Turn it on for one site first. Set it comfortably above that site's longest usual coverage gap (for example 60), watch the
  Patrol command "Missed" and delayed-review counts for a week, then widen. If a site has long gaps, leave it off there and accept that the UI-only
  hiding is the control.

## 3. Logging out ends every session for that account

- **Decision.** `destroySession` bumps `tokenVersion`, so signing out on one device signs the account out everywhere.
- **Why.** Sessions are stateless tokens; one counter is the simplest revocation that is also correct after a password change. A per-session table would
  allow signing out one device only, at the cost of a lookup per request.
- **Would change if.** Operators routinely stay signed in on a control-room screen and a phone at once and find this disruptive.

## 4. When the client address is unknown, login is limited per account, not per source

- **Decision.** With `TRUST_PROXY_HOPS` unset, login allows 30 failures per account per 15 minutes and there is no shared bucket; `checkEnv` warns in production.
- **Why.** A shared bucket let any stranger lock every account out. A roomier per-account budget still slows guessing; set the hop count to get per-source limits.

## 5. Handover owners cover shifts and devices; alerts keep acknowledgement

- **Decision.** Only `shift:` and `device:` rows can be claimed. A guard alert's owner stays its `acknowledgedBy`, so there is one source of truth for who is
  handling an alert and the guard's phone keeps showing it.
