import { publicFailure } from "@/lib/security/api-errors";
import { NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { apiUser } from "@/lib/auth/rbac";
import type { SessionUser } from "@/lib/auth/session";

export const json = (data: unknown, init?: number) =>
  NextResponse.json(data, { status: init ?? 200 });
export const error = (message: string, status = 400) =>
  NextResponse.json({ error: message }, { status });

/** Wrap a handler with auth + error handling. */
export function guarded<
  T extends { params: Promise<Record<string, string>> } = {
    params: Promise<Record<string, string>>;
  },
>(minimum: Role, handler: (req: Request, ctx: T, user: SessionUser) => Promise<Response>) {
  return async (req: Request, ctx: T) => {
    try {
      const { user, status } = await apiUser(minimum);
      if (status !== 200 || !user)
        return error(status === 401 ? "Not signed in" : "Forbidden", status);
      return await handler(req, ctx, user);
    } catch (e) {
      const failure = publicFailure(e);
      return error(failure.message, failure.status);
    }
  };
}

export function paging(url: URL, defaultTake = 50) {
  const take = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? defaultTake)));
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1));
  return { take, skip: (page - 1) * take, page };
}
