/**
 * Just-in-time delivery of patrol windows.
 *
 * A guard must not know the schedule in advance. By default the phone is given the whole session plan
 * (it needs the windows to prompt and to check scans while offline), and the app simply does not show
 * future windows. With PATROL_WINDOW_LOOKAHEAD_MINUTES set, the server stops sending windows that open
 * further ahead than that, so a rooted phone has nothing to read. The trade-off is offline: a phone that
 * loses its connection for longer than the look-ahead has no window to prompt from until it syncs again,
 * so pick a value comfortably longer than your usual coverage gaps (the phone syncs every few minutes online).
 */
export const MIN_LOOKAHEAD_MINUTES = 5;
export const MAX_LOOKAHEAD_MINUTES = 240;

/** 0 (or unset, or invalid) means "send the whole plan", the existing behaviour. */
export function lookaheadMinutes(
  raw: string | undefined = process.env.PATROL_WINDOW_LOOKAHEAD_MINUTES,
): number {
  const n = Number(raw);
  if (!raw || !Number.isFinite(n) || n <= 0) return 0;
  return Math.min(MAX_LOOKAHEAD_MINUTES, Math.max(MIN_LOOKAHEAD_MINUTES, Math.floor(n)));
}

/** Windows already open, past, or opening within the look-ahead. Everything later stays on the server. */
export function revealWindows<T extends { dueAt: Date }>(
  assignments: T[],
  now: Date,
  lookahead = lookaheadMinutes(),
): T[] {
  if (lookahead <= 0) return assignments;
  const horizon = +now + lookahead * 60_000;
  return assignments.filter((a) => +a.dueAt <= horizon);
}
