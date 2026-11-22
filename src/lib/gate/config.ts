/** One place that reads and validates the inventory connection settings. Never returns a secret to a client. */
export type OutboundConfig =
  { ok: true; url: string; token: string; secret: string } | { ok: false; problems: string[] };

const MIN = 32;

export function outboundConfig(env: NodeJS.ProcessEnv = process.env): OutboundConfig {
  const problems: string[] = [];
  const raw = env.GATE_OUTBOUND_URL;
  const token = env.GATE_OUTBOUND_TOKEN ?? "";
  const secret = env.GATE_OUTBOUND_SIGNING_SECRET ?? "";
  let url = "";
  if (!raw) problems.push("GATE_OUTBOUND_URL is not set");
  else {
    try {
      const u = new URL(raw);
      const local =
        env.GATE_ALLOW_LOCAL_TEST === "true" &&
        u.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(u.hostname);
      if (u.username || u.password || u.hash)
        problems.push("GATE_OUTBOUND_URL must not embed credentials");
      else if (u.protocol !== "https:" && !local) problems.push("GATE_OUTBOUND_URL must use HTTPS");
      else url = u.toString();
    } catch {
      problems.push("GATE_OUTBOUND_URL is not a valid URL");
    }
  }
  if (token.length < MIN) problems.push(`GATE_OUTBOUND_TOKEN must be at least ${MIN} characters`);
  if (secret.length < MIN)
    problems.push(`GATE_OUTBOUND_SIGNING_SECRET must be at least ${MIN} characters`);
  return problems.length ? { ok: false, problems } : { ok: true, url, token, secret };
}

export function inboundStatus(env: NodeJS.ProcessEnv = process.env) {
  const problems: string[] = [];
  if ((env.GATE_INBOUND_TOKEN ?? "").length < MIN)
    problems.push(`GATE_INBOUND_TOKEN must be at least ${MIN} characters`);
  if (!inboundSites(env).length) problems.push("GATE_INBOUND_SITE_IDS lists no sites");
  return { ok: !problems.length, problems, signed: !!env.GATE_INBOUND_SIGNING_SECRET };
}

export function inboundSites(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.GATE_INBOUND_SITE_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Automatic attempts before a delivery is parked for an operator. About 12 hours at the 1-hour cap. */
export function maxAttempts(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.GATE_MAX_ATTEMPTS);
  return Number.isInteger(n) && n >= 3 && n <= 100 ? n : 20;
}
