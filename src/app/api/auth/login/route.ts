import { clientIp } from "@/lib/security/client-ip";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyPassword, DUMMY_PASSWORD_HASH, hashPassword, passwordNeedsRehash } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { loginBlocked, clearLoginPair } from "@/lib/auth/throttle";

export async function POST(req: Request) {
  const { email, password } = (await req.json().catch(() => ({}))) as { email?: string; password?: string };
  if (typeof email !== "string" || typeof password !== "string" || !email || !password || email.length > 254 || password.length > 1024) return NextResponse.json({ error: "email and password are required" }, { status: 400 });
  const ip = clientIp(req);
  const throttle = await loginBlocked(ip, email);
  if (throttle.blocked) return NextResponse.json({ error: "Too many failed sign-ins. Try again later." }, { status: 429, headers: { "Retry-After": String(throttle.retryAfterSeconds) } });
  const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });
  const validPassword = await verifyPassword(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (!user || !user.active || !validPassword) { return NextResponse.json({ error: "Invalid credentials" }, { status: 401 }); }
  if (passwordNeedsRehash(user.passwordHash)) await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password), tokenVersion: { increment: 1 } } });
  await clearLoginPair(ip, email);
  await createSession(user.id);
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit({ userId: user.id, actor: user.name, action: "USER_LOGIN", entity: "User", entityId: user.id, ip, userAgent: req.headers.get("user-agent") });
  return NextResponse.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
}
