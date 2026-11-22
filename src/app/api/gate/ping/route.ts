import { guarded, json } from "@/lib/api";
import { rateLimit } from "@/lib/security/rate-limit";
import { pingInventory } from "@/lib/gate/delivery";

/** Sends one signed test event. Creates no movement and no delivery row. */
export const POST = guarded("ADMIN", async (_req, _ctx, user) => {
  if (!(await rateLimit(`gate:ping:${user.id}`, 6, 60_000)).ok)
    return json({ ok: false, detail: "Wait a moment before testing again." }, 429);
  return json(await pingInventory());
});
