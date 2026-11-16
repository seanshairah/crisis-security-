import { cn } from "@/lib/cn";

/** Crisis Security shield mark, sized for the operations interface. */
export function BrandMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center rounded-[9px] bg-accent-gradient", className)} style={{ width: size, height: size }} aria-hidden>
      <svg viewBox="0 0 24 24" width={size * 0.62} height={size * 0.62} fill="currentColor">
        <path d="M12 2 3 6v6c0 5 4 8 9 10 5-2 9-5 9-10V6l-9-4Zm4 6v2h-5l-2 2 2 2h5v2h-6l-4-4 4-4h6Z" />
      </svg>
    </span>
  );
}

export const COMPANY = {
  name: "Crisis Security",
  portal: "Operations portal",
  tagline: "Guarding and site operations across Zimbabwe",
  city: "Harare, Zimbabwe",
  domain: "Not configured",
};
