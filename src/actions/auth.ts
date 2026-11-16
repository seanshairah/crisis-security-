"use server";
import { clientIp } from "@/lib/security/client-ip";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { verifyPassword, DUMMY_PASSWORD_HASH, hashPassword, passwordNeedsRehash } from "@/lib/auth/password";
import { createSession, destroySession, getSessionUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { loginBlocked, clearLoginPair } from "@/lib/auth/throttle";

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const h = await headers();
  const ip = clientIp({ headers: h });
  const throttle = await loginBlocked(ip, email);
  if (throttle.blocked) {
    await audit({ actor: email || "unknown", action: "LOGIN_THROTTLED", entity: "User", details: { email, retryAfterSeconds: throttle.retryAfterSeconds }, ip });
    redirect("/login?error=throttled");
  }
  const user = await db.user.findUnique({ where: { email } });
  const validPassword = await verifyPassword(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (!user || !validPassword) {
    await audit({ actor: email || "unknown", action: "LOGIN_FAILED", entity: "User", details: { email }, ip });
    redirect("/login?error=1");
  }
  if (!user.active) redirect("/login?error=inactive");
  if (passwordNeedsRehash(user.passwordHash)) await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password), tokenVersion: { increment: 1 } } });
  await clearLoginPair(ip, email);
  await createSession(user.id);
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit({ userId: user.id, actor: user.name, action: "USER_LOGIN", entity: "User", entityId: user.id, ip, userAgent: h.get("user-agent") });
  redirect("/dashboard");
}

export async function logout() {
  const user = await getSessionUser();
  if (user) await audit({ userId: user.id, actor: user.name, action: "USER_LOGOUT", entity: "User", entityId: user.id });
  await destroySession();
  redirect("/login");
}
