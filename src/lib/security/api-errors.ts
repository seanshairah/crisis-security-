import { ZodError } from "zod";
export class DomainError extends Error {
  constructor(
    message: string,
    public readonly status = /not found/i.test(message)
      ? 404
      : /conflict|already.*used/i.test(message)
        ? 409
        : 400,
  ) {
    super(message);
  }
}
export function publicFailure(e: unknown): { message: string; status: number; retryable: boolean } {
  if (e instanceof DomainError) return { message: e.message, status: e.status, retryable: false };
  if (e instanceof ZodError || e instanceof SyntaxError)
    return { message: "Check the request details and try again.", status: 400, retryable: false };
  const code = e && typeof e === "object" && "code" in e ? String(e.code) : "";
  if (code === "P2025") return { message: "Record not found", status: 404, retryable: false };
  if (code === "P2002")
    return { message: "This record already exists", status: 409, retryable: false };
  console.error("API operation failed", e);
  return {
    message: "Unable to complete this request. Please try again.",
    status: /^P10|^P20(24|28|34)$/.test(code) ? 503 : 500,
    retryable: true,
  };
}
