/**
 * Just-in-time delivery of patrol windows.
 *
 * A guard must not know the schedule in advance. With a look-ahead, the server only sends the phone windows that
 * are already open or open within the look-ahead, so a rooted phone has no night's schedule to read. The phone
 * re-syncs about every 5 minutes online, so upcoming windows keep arriving in time.
 *
 * The cost is offline: a phone without signal for longer than the look-ahead has nothing to prompt from until it
 * syncs again. Off sends the whole plan, so prompting survives any outage.
 *
 * Each site chooses (PatrolPolicy.lookaheadMode):
 *   DEFAULT  follow PATROL_WINDOW_LOOKAHEAD_MINUTES ("auto", a number of minutes, or unset/0 for off)
 *   OFF      whole plan on the phone
 *   AUTO     the site's longest gap + 30 minutes, kept between 45 and 120: the next check is always on the phone,
 *            with half an hour of lost signal to spare
 *   CUSTOM   lookaheadMinutes, 5-240
 */
export const MIN_LOOKAHEAD_MINUTES = 5;
export const MAX_LOOKAHEAD_MINUTES = 240;
export const AUTO_BUFFER_MINUTES = 30;
export const AUTO_MIN_MINUTES = 45;
export const AUTO_MAX_MINUTES = 120;

export type LookaheadMode = "DEFAULT" | "OFF" | "AUTO" | "CUSTOM";
export type LookaheadPolicy = {
  lookaheadMode?: LookaheadMode | null;
  lookaheadMinutes?: number | null;
  maxIntervalMinutes: number;
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Minutes for an explicit value; 0 means off. */
export function lookaheadMinutes(raw: string | number | null | undefined): number {
  const n = Number(raw);
  if (raw === null || raw === undefined || raw === "" || !Number.isFinite(n) || n <= 0) return 0;
  return clamp(Math.floor(n), MIN_LOOKAHEAD_MINUTES, MAX_LOOKAHEAD_MINUTES);
}

export function autoLookahead(maxIntervalMinutes: number): number {
  return clamp(maxIntervalMinutes + AUTO_BUFFER_MINUTES, AUTO_MIN_MINUTES, AUTO_MAX_MINUTES);
}

/** The deployment default as a mode: "auto", a fixed number, or off. */
export function deploymentDefault(
  raw: string | undefined = process.env.PATROL_WINDOW_LOOKAHEAD_MINUTES,
): { mode: "OFF" | "AUTO" | "CUSTOM"; minutes: number } {
  if (raw?.trim().toLowerCase() === "auto") return { mode: "AUTO", minutes: 0 };
  const m = lookaheadMinutes(raw);
  return m > 0 ? { mode: "CUSTOM", minutes: m } : { mode: "OFF", minutes: 0 };
}

/** The look-ahead in minutes for one site (0 = whole plan). */
export function siteLookahead(
  policy: LookaheadPolicy | null | undefined,
  envRaw: string | undefined = process.env.PATROL_WINDOW_LOOKAHEAD_MINUTES,
): number {
  if (!policy) return 0;
  const mode = policy.lookaheadMode ?? "DEFAULT";
  if (mode === "OFF") return 0;
  if (mode === "AUTO") return autoLookahead(policy.maxIntervalMinutes);
  if (mode === "CUSTOM") return lookaheadMinutes(policy.lookaheadMinutes);
  const d = deploymentDefault(envRaw);
  return d.mode === "AUTO" ? autoLookahead(policy.maxIntervalMinutes) : d.minutes;
}

/** Windows already open, past, or opening within the look-ahead. Everything later stays on the server. */
export function revealWindows<T extends { dueAt: Date }>(
  assignments: T[],
  now: Date,
  lookahead: number,
): T[] {
  if (lookahead <= 0) return assignments;
  const horizon = +now + lookahead * 60_000;
  return assignments.filter((a) => +a.dueAt <= horizon);
}
