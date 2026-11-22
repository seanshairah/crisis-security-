export function isPlaceholder(value: string | undefined): boolean;
export function toSessionPooler(url: string): string | undefined;
export function resolveMigrationUrl(
  env: Record<string, string | undefined>,
):
  | { url: string; source: string; replacedPlaceholder?: boolean; error?: undefined }
  | { error: string; url?: undefined };
export function resolveRuntimeUrl(env: Record<string, string | undefined>): string | undefined;
