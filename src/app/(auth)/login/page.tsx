import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { login } from "@/actions/auth";
import { Input, Field, FormError } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { BrandMark, COMPANY } from "@/components/layout/brand";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await getSessionUser()) redirect("/dashboard");
  const { error } = await searchParams;
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex w-full items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex items-center gap-2.5">
            <BrandMark size={40} className="rounded-[11px]" />
            <div>
              <p className="text-[17px] font-semibold leading-tight text-ink">{COMPANY.name}</p>
              <p className="text-[12px] text-ink-2">{COMPANY.portal}</p>
            </div>
          </div>
          <form
            action={login}
            className="space-y-4 rounded-[var(--radius-card)] border border-line bg-surface p-5 sm:p-6"
          >
            <div>
              <h1 className="font-display text-[34px] leading-none text-ink">Sign in</h1>
              <p className="mt-1 text-[13px] text-ink-2">Sign in to your operations workspace.</p>
            </div>
            <FormError
              message={
                error === "1"
                  ? "Email or password is incorrect."
                  : error === "inactive"
                    ? "This account has been deactivated."
                    : error === "throttled"
                      ? "Too many failed sign-ins. Wait 15 minutes and try again."
                      : null
              }
            />
            <Field label="Email">
              <Input name="email" type="email" required autoComplete="email" />
            </Field>
            <Field label="Password">
              <Input name="password" type="password" required autoComplete="current-password" />
            </Field>
            <Button type="submit" variant="primary" className="w-full">
              Sign in
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
