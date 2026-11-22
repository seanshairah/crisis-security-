import { gateBody } from "@/lib/gate/contract";
import { authenticateGateway } from "@/lib/gateway/auth";
import { json, error } from "@/lib/api";
import { publicFailure } from "@/lib/security/api-errors";
import { applyGuardCommand, listForGuard } from "@/lib/gate/service";
import { rateLimit } from "@/lib/security/rate-limit";
async function handle(req: Request) {
  const a = await authenticateGateway(req);
  if (!a.device) return error(a.error, a.status);
  if (!(await rateLimit(`gate:${a.device.id}`, 120, 60000)).ok)
    return error("Please wait and try again", 429);
  try {
    if (req.method === "GET") {
      const u = new URL(req.url);
      return json(
        await listForGuard(
          a.device.id,
          u.searchParams.get("sessionId") ?? "",
          (u.searchParams.get("q") ?? "").slice(0, 2000),
        ),
      );
    }
    return json(await applyGuardCommand(a.device.id, await gateBody(req)));
  } catch (e) {
    const f = publicFailure(e);
    return error(f.message, f.status);
  }
}
export const GET = handle;
export const POST = handle;
