import { rateLimit, clearRateLimit } from "@/lib/security/rate-limit";
/** Account+source budgets avoid letting one source lock an account on every device. */
export async function loginBlocked(ip: string | null, email: string) {
  const source = ip ?? "untrusted-ingress";
  const address = await rateLimit(`login-source:${source}`, 100, 900000);
  const pair = await rateLimit(`login-pair:${source}:${email.toLowerCase()}`, 10, 900000);
  return { blocked: !address.ok || !pair.ok, retryAfterSeconds: Math.max(address.retryAfterSeconds, pair.retryAfterSeconds) };
}

export async function clearLoginPair(ip: string | null, email: string) { await clearRateLimit(`login-pair:${ip ?? "untrusted-ingress"}:${email.toLowerCase()}`); }
