import type { IconProps } from "./CheckIcon";

/** Lapiz -- estado "editado"/corregido manualmente. `currentColor` para heredar del contenedor. */
export function EditIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <path
        d="M4 20L4.8 16.4L16 5.2C16.6 4.6 17.6 4.6 18.2 5.2L18.8 5.8C19.4 6.4 19.4 7.4 18.8 8L7.6 19.2L4 20Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
