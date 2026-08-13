import type { IconProps } from "./CheckIcon";

/** Triangulo + exclamacion -- estado "revisar"/"atencion". `currentColor` para heredar del contenedor. */
export function WarningIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path d="M12 3.5L21.5 20H2.5L12 3.5Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M12 9.5V14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="17" r="1" fill="currentColor" />
    </svg>
  );
}
