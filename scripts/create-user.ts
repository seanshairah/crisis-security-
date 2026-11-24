/**
 * Create one Crisis portal user directly in the configured database.
 *
 * Intended for recovery when no Super Admin session is available. It deliberately requires an
 * explicit production acknowledgement and prompts for the password so it is not kept in shell
 * history. It never changes an existing account.
 *
 * Example:
 *   DATABASE_URL='postgresql://…' npm run user:create -- \
 *     --production --name 'Clemence' --email clemence@grandmeal.security --role SUPERVISOR
 */
import { existsSync } from "node:fs";
import { stdin as input, stdout as output } from "node:process";
import { config as loadEnv } from "dotenv";
import { hashPassword } from "../src/lib/auth/password";

const roles = new Set(["SUPER_ADMIN", "ADMIN", "SUPERVISOR"]);
const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 1) {
  const key = process.argv[i];
  if (!key.startsWith("--")) continue;
  const value = process.argv[i + 1];
  if (value && !value.startsWith("--")) {
    args.set(key.slice(2), value);
    i += 1;
  } else args.set(key.slice(2), "true");
}

function usage(message?: string): never {
  if (message) console.error(`Error: ${message}\n`);
  console.error(`Usage:
  npm run user:create -- --env-file .env.production.local \\
    --production --name 'Full name' --email user@example.com --role SUPERVISOR

Roles: SUPER_ADMIN, ADMIN, SUPERVISOR
Use --env-file with an environment file downloaded from Vercel, or set DATABASE_URL yourself.
The password is prompted securely and is never accepted on the command line.`);
  process.exit(1);
}

async function passwordPrompt(): Promise<string> {
  if (!input.isTTY) usage("Run this command from an interactive terminal so the password can be hidden.");
  return new Promise((resolve) => {
    let value = "";
    output.write("New password: ");
    input.setRawMode?.(true);
    input.resume();
    input.setEncoding("utf8");
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === "\r" || char === "\n") {
          input.off("data", onData);
          input.setRawMode?.(false);
          input.pause();
          output.write("\n");
          resolve(value);
        } else if (char === "\u0003") {
          input.off("data", onData);
          input.setRawMode?.(false);
          input.pause();
          output.write("\n");
          process.exit(130);
        } else if (char === "\u007f" || char === "\b") {
          value = value.slice(0, -1);
        } else if (char >= " ") value += char;
      }
    };
    input.on("data", onData);
  });
}

async function main() {
  if (args.get("help") === "true") usage();
  if (args.get("production") !== "true") usage("Pass --production to acknowledge this writes to the configured production database.");
  const envFile = args.get("env-file");
  if (envFile) {
    if (!existsSync(envFile)) usage(`Environment file does not exist: ${envFile}`);
    loadEnv({ path: envFile, override: true, quiet: true });
  }
  if (!process.env.DATABASE_URL) usage("DATABASE_URL is required.");
  try {
    const url = new URL(process.env.DATABASE_URL);
    if (url.protocol !== "postgresql:" && url.protocol !== "postgres:")
      usage("DATABASE_URL must begin with postgresql:// or postgres://.");
  } catch {
    usage("DATABASE_URL must be a valid PostgreSQL connection string.");
  }

  const name = args.get("name")?.trim();
  const email = args.get("email")?.trim().toLowerCase();
  const role = args.get("role");
  if (!name || name.length < 2) usage("--name must contain at least two characters.");
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) usage("--email must be a valid email address.");
  if (!role || !roles.has(role)) usage("--role must be SUPER_ADMIN, ADMIN or SUPERVISOR.");

  const password = await passwordPrompt();
  if (password.length < 12 || new TextEncoder().encode(password).length > 72)
    usage("Password must be 12–72 UTF-8 bytes.");

  // Import only after an optional --env-file has populated DATABASE_URL.
  const { db } = await import("../src/lib/db");
  try {
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) throw new Error(`An account already exists for ${email}; no changes were made.`);

    const user = await db.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { name, email, role: role as "SUPER_ADMIN" | "ADMIN" | "SUPERVISOR", passwordHash: await hashPassword(password) },
        select: { id: true, name: true, email: true, role: true, active: true },
      });
      await tx.auditLog.create({
        data: {
          actor: "terminal-user-create",
          action: "USER_CREATED",
          entity: "User",
          entityId: created.id,
          details: { email: created.email, role: created.role, source: "scripts/create-user.ts" },
        },
      });
      return created;
    });
    console.log(JSON.stringify({ created: user, passwordStored: false }));
  } finally {
    await db.$disconnect();
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
