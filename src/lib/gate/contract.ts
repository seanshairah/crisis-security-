import { DomainError } from "@/lib/security/api-errors";
import { z } from "zod";
export const detailsSchema = z
  .object({
    category: z.enum(["MAIZE", "MACHINERY", "OTHER"]),
    items: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(200),
          description: z.string().trim().max(500).default(""),
          quantity: z.number().positive().max(1e9),
          unit: z.string().trim().min(1).max(40),
        }),
      )
      .min(1)
      .max(40),
    party: z.string().trim().min(1).max(200),
    place: z.string().trim().min(1).max(300),
    occurredAt: z.iso.datetime(),
    vehicleType: z.enum(["NONE", "TRUCK", "CAR", "OTHER"]),
    registration: z.string().trim().max(40).default(""),
    note: z.string().trim().max(2000).default(""),
  })
  .superRefine((v, c) => {
    if (v.vehicleType !== "NONE" && !v.registration)
      c.addIssue({
        code: "custom",
        path: ["registration"],
        message: "Enter the vehicle registration",
      });
    if (v.category === "OTHER" && !v.items.some((i) => i.description))
      c.addIssue({ code: "custom", path: ["items"], message: "Describe the other inventory" });
  });
export type GateDetails = z.infer<typeof detailsSchema>;
export const inboundSchema = z.object({
  reference: z.string().trim().min(1).max(100),
  locationId: z.string().min(1).max(100),
  direction: z.enum(["ARRIVAL", "DEPARTURE"]),
  details: detailsSchema,
});
export const commandSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("RECORD"),
    commandId: z.uuid(),
    sessionId: z.string().min(1),
    checkpointId: z.string().min(1),
    capturedAt: z.iso.datetime(),
    direction: z.enum(["ARRIVAL", "DEPARTURE"]),
    details: detailsSchema,
  }),
  z.object({
    action: z.literal("VERIFY"),
    commandId: z.uuid(),
    sessionId: z.string().min(1),
    checkpointId: z.string().min(1),
    capturedAt: z.iso.datetime(),
    movementId: z.string().min(1),
    version: z.number().int().positive(),
    decision: z.enum(["APPROVE", "REJECT", "REVIEW"]),
    reason: z.string().trim().max(2000).default(""),
    details: detailsSchema,
  }),
]);
export function differences(expected: GateDetails, observed: GateDetails): string[] {
  return (["category", "items", "party", "place", "vehicleType", "registration"] as const).filter(
    (k) => canonical(expected[k]) !== canonical(observed[k]),
  );
}
export function gateDecision(
  decision: string,
  mismatch: boolean,
  allowed: boolean,
  reason: string,
) {
  if ((decision === "REJECT" || decision === "REVIEW" || mismatch) && !reason.trim())
    throw new Error("Explain the rejection or difference");
  if (mismatch || decision === "REVIEW" || !allowed) return "REVIEW" as const;
  return decision === "REJECT" ? ("REJECTED" as const) : ("APPROVED" as const);
}

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value !== null && typeof value === "object")
    return (
      "{" +
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => JSON.stringify(k) + ":" + canonical(v))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}

export async function gateBody(req: Request): Promise<unknown> {
  const text = await req.text();
  if (Buffer.byteLength(text) > 100_000) throw new DomainError("Gate request is too large", 413);
  return JSON.parse(text);
}
