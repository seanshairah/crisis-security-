import { usableSecret } from "@/lib/security/secrets";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { cache } from "react";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";

const secureHost = process.env.NODE_ENV === "production" && (process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "").startsWith("https://");
const COOKIE = secureHost ? "__Host-crisis_session" : "crisis_session";
const secret = () => {
  const v = process.env.AUTH_SECRET;
  if (!usableSecret(v) || v.length < 32) throw new Error("Configure a private AUTH_SECRET of at least 32 characters");
  return new TextEncoder().encode(v);
};

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatarUrl: string | null;
  title: string | null;
};

export async function createSession(userId: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { tokenVersion: true } });
  const token = await new SignJWT({ sub: userId, version: user.tokenVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("crisis-security")
    .setAudience("crisis-portal")
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret());
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const user = await getSessionUser();
  if (user) await db.user.update({ where: { id: user.id }, data: { tokenVersion: { increment: 1 } } });
  jar.delete(COOKIE);
}

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  let id: string;
  let version: unknown;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"], issuer: "crisis-security", audience: "crisis-portal" });
    if (!payload.sub) return null;
    id = payload.sub;
    version = payload.version;
  } catch {
    return null;
  }
  // Storage failures are infrastructure failures, not evidence of an invalid login.
  const user = await db.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, role: true, avatarUrl: true, title: true, active: true, tokenVersion: true },
  });
  if (!user || !user.active || version !== user.tokenVersion) return null;
  return { id: user.id, name: user.name, email: user.email, role: user.role, avatarUrl: user.avatarUrl, title: user.title };
});
