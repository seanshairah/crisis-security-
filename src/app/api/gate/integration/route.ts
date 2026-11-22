import { guarded, json } from "@/lib/api";
import { integrationStatus } from "@/lib/gate/status";
export const GET = guarded("ADMIN", async () => json(await integrationStatus()));
