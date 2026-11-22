import { guarded, json } from "@/lib/api";
import { deliverGateDecisions } from "@/lib/gate/delivery";
export const POST = guarded("ADMIN", async () => json(await deliverGateDecisions(5)));
export const maxDuration = 60;
