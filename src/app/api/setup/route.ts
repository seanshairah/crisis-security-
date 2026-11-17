import { guarded, json } from "@/lib/api";
import { Prisma } from "@prisma/client";
import { saveSetup } from "@/lib/patrol/setup-service";
export const POST = guarded("ADMIN", async (req, _ctx, user) => {
  try {
    return json(await saveSetup(await req.json(), user), 201);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")
      throw Error(
        "That phone number, ID or code is already registered. Choose the existing record or enter a different one.",
      );
    throw e;
  }
});
