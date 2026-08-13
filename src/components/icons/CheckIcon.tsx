export interface IconProps {
  className?: string;
}

/** Circulo + check -- estado "OK"/"validado". Usa `currentColor` para heredar el color del contenedor (incluye dark mode) en vez de fijar uno propio. */
export function CheckIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={className}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M8 12.5L10.5 15L16 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
