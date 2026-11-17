import { rateLimit, clearRateLimit } from "@/lib/security/rate-limit";
/** Account+source budgets avoid letting one source lock an account on every device. */
/**
 * With a trusted source address, a failure budget applies per source and per source+account pair.
 * Without one (TRUST_PROXY_HOPS unset), every visitor would share a single source, so a stranger
 * could exhaust the budget and lock every account out. There the budget is per account only and
 * deliberately roomier (a brake on guessing, not a hard stop), and checkEnv warns in production.
 */
export const UNTRUSTED_ACCOUNT_LIMIT = 30;
export async function loginBlocked(ip: string | null, email: string) {
  const account = email.toLowerCase();
  if (!ip) {
    const r = await rateLimit(`login-account:${account}`, UNTRUSTED_ACCOUNT_LIMIT, 900000);
    return { blocked: !r.ok, retryAfterSeconds: r.retryAfterSeconds };
  }
  const address = await rateLimit(`login-source:${ip}`, 100, 900000);
  const pair = await rateLimit(`login-pair:${ip}:${account}`, 10, 900000);
  return {
    blocked: !address.ok || !pair.ok,
    retryAfterSeconds: Math.max(address.retryAfterSeconds, pair.retryAfterSeconds),
  };
}

export async function clearLoginPair(ip: string | null, email: string) {
  const account = email.toLowerCase();
  await clearRateLimit(ip ? `login-pair:${ip}:${account}` : `login-account:${account}`);
}
