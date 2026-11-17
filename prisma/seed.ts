/**
 * Production seed for Crisis Security. Safe to run repeatedly.
 * Creates the settings and message templates that are missing and the single super admin.
 * Never touches operational data. Run: npm run db:seed
 *   ADMIN_PASSWORD=…  password for the super admin (required on first run; later runs leave it alone)
 */
import { config as loadEnv } from "dotenv";
loadEnv();
import bcrypt from "bcryptjs";
import { TEMPLATE_DEFS } from "../src/lib/sms/templates";
import { SETTING_DEFS } from "../src/lib/settings";
import { db } from "../src/lib/db";

export const SUPER_ADMIN = {
  name: process.env.ADMIN_NAME ?? "Crisis Administrator",
  email: process.env.ADMIN_EMAIL ?? "admin@crisissecurity.local",
  title: "Administrator",
  phone: process.env.ADMIN_PHONE ?? null,
  avatarUrl: "/avatars/admin.svg",
};

export async function ensureBaseline() {
  for (const s of SETTING_DEFS) {
    await db.setting.upsert({
      where: { key: s.key },
      update: { label: s.label, description: s.description, group: s.group },
      create: {
        key: s.key,
        value: s.default,
        label: s.label,
        description: s.description,
        group: s.group,
      },
    });
  }
  for (const t of TEMPLATE_DEFS) {
    await db.messageTemplate.upsert({
      where: { key: t.key },
      update: { name: t.name, description: t.description, variables: t.variables },
      create: {
        key: t.key,
        name: t.name,
        description: t.description,
        body: t.body,
        variables: t.variables,
      },
    });
  }
  const existing = await db.user.findUnique({ where: { email: SUPER_ADMIN.email } });
  if (existing) {
    return existing.id;
  }
  const password = process.env.ADMIN_PASSWORD;
  if (!password || password.length < 12 || new TextEncoder().encode(password).length > 72)
    throw new Error(
      "ADMIN_PASSWORD must be 12 characters or longer and fit within 72 UTF-8 bytes.",
    );
  const u = await db.user.create({
    data: { ...SUPER_ADMIN, role: "SUPER_ADMIN", passwordHash: await bcrypt.hash(password, 12) },
  });
  return u.id;
}

if (process.argv[1]?.endsWith("seed.ts")) {
  ensureBaseline()
    .then(() => console.log("Baseline ready: settings, templates and the super admin."))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => db.$disconnect());
}
