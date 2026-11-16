import { isIP } from "node:net";
/** Trust only explicitly configured proxy hops. The ingress MUST overwrite/append XFF. */
export function clientIp(
  req: Pick<Request, "headers">,
  hops = Number(process.env.TRUST_PROXY_HOPS ?? 0),
): string | null {
  if (!Number.isInteger(hops) || hops < 1 || hops > 10) return null;
  const chain = (req.headers.get("x-forwarded-for") ?? "").split(",").map((v) => v.trim());
  const ip = chain[chain.length - hops];
  return ip && isIP(ip) ? ip : null;
}
