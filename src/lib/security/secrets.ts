import { createHash, timingSafeEqual } from "node:crypto";
export function usableSecret(value: string | undefined): value is string {
  return !!value && !value.startsWith("change-me") && !value.startsWith("dev-secret-");
}
export function secretMatches(
  expected: string | undefined,
  supplied: string | null | undefined,
): boolean {
  if (!usableSecret(expected) || !supplied) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(expected), digest(supplied));
}
