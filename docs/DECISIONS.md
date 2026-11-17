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

## 2. Patrol window look-ahead: per site, automatic recommended

- **Context.** The guard app hides future patrol windows, but by default the phone receives the whole session plan, so a
  rooted phone could read it.
- **Decision.** Each site chooses how much of the schedule its phones hold (Sites → the site → QR checkpoints & patrol
  timing): *Deployment default*, *Automatic*, *Whole shift* or *Custom minutes*. *Automatic* sends the next check plus
  30 minutes for lost signal (the site's longest gap + 30, kept between 45 and 120 minutes). The deployment default comes
  from `PATROL_WINDOW_LOOKAHEAD_MINUTES` (`auto`, a number, or unset for whole shift). Recommended production setting:
  `auto`, with sites that have long dead zones switched to *Whole shift*.
- **Why automatic, and why those numbers.** The phone syncs about every 5 minutes online, so it only needs the next
  window to prompt on time; anything beyond that only helps while offline. "Next gap + 30 minutes" means a phone that
  loses signal for half an hour still prompts for the next check, while a tampered phone shows at most the next one or
  two checks instead of the whole night. A floor of 45 minutes covers sync delays on very frequent patrols; a cap of 120
  keeps a relaxed site from exposing most of a shift.
- **Cost.** A phone offline for longer than its look-ahead has no window to prompt from until it syncs; those checks
  show as missed in Patrol command. That is why dead-zone sites stay on *Whole shift*.
- **Watch.** After turning it on, compare Patrol command's missed and delayed-review counts with the week before, per site.

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
