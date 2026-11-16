import bcrypt from "bcryptjs";

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// A fixed valid hash ensures unknown accounts still perform a password comparison.
export const DUMMY_PASSWORD_HASH = bcrypt.hashSync("crisis-unusable-dummy-password", 12);
