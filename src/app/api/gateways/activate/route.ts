import { publicFailure } from "@/lib/security/api-errors";
import { NextResponse } from "next/server";
import { activateGateway } from "@/lib/gateway/service";
import { clientIp, rateLimit } from "@/lib/gateway/auth";

/**
 * POST /api/gateways/activate  { activationCode, appVersion?, androidVersion?, deviceModel?, batteryLevel?, networkType? }
 * Public (the phone has no credentials yet). Returns the device token exactly once.
 */
export async function POST(req: Request) {
  const ip = clientIp(req);
  // Unknown source (TRUST_PROXY_HOPS unset): one shared bucket, so keep it roomy. The per-code budget below is the real guard.
  const rl = ip ? await rateLimit(`activate:${ip}`, 10, 60_000) : await rateLimit("activate:unknown-source", 120, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const code = typeof b.activationCode === "string" ? b.activationCode : typeof b.code === "string" ? b.code : "";
  if (!code.trim()) return NextResponse.json({ error: "activationCode is required" }, { status: 400 });
  const codeBudget = await rateLimit(`activation-code:${code.trim().toUpperCase()}`, 20, 900000);
  if (!codeBudget.ok) return NextResponse.json({ error: "Too many attempts for this code" }, { status: 429 });
  try {
    const { device, token, config } = await activateGateway(code, { appVersion: str(b.appVersion), androidVersion: str(b.androidVersion), deviceModel: str(b.deviceModel), batteryLevel: num(b.batteryLevel), networkType: str(b.networkType), locationPermission: str(b.locationPermission), callPermission: str(b.callPermission) }, ip);
    return NextResponse.json({ deviceId: device.id, deviceToken: token, deviceName: device.deviceName, phoneNumber: device.phoneNumber, mode: device.mode, guard: device.guard ? { id: device.guard.id, name: `${device.guard.firstName} ${device.guard.lastName}`, guardNo: device.guard.guardNo } : null, location: device.location ? { id: device.location.id, name: device.location.name, client: device.location.client.name } : null, config });
  } catch (e) {
    const f = publicFailure(e); return NextResponse.json({ error: f.message }, { status: f.status });
  }
}

const str = (v: unknown) => (typeof v === "string" ? v : undefined);
const num = (v: unknown) => (typeof v === "number" ? v : undefined);
