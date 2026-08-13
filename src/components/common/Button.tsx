import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "danger" | "outline";
export type ButtonSize = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-300 dark:bg-brand-500 dark:hover:bg-brand-600",
  secondary:
    "border border-neutral-300 text-neutral-700 hover:bg-neutral-50 disabled:text-neutral-400 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-900",
  danger:
    "border border-critical-500 text-critical-600 hover:bg-critical-50 disabled:text-critical-300 disabled:border-critical-200 dark:border-critical-700 dark:text-critical-400 dark:hover:bg-critical-900/20",
  outline:
    "border border-brand-500 text-brand-600 hover:bg-brand-600 hover:text-white disabled:border-brand-200 disabled:text-brand-300 dark:border-brand-600 dark:text-brand-400 dark:hover:bg-brand-600 dark:hover:text-white",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "px-3 py-2 text-sm",
  md: "px-4 py-3 text-base",
};

/**
 * Botón base del sistema de diseño — 3 variantes (`primary` para la acción
 * principal de una vista, `secondary` para acciones alternas, `danger` para
 * acciones destructivas/de rechazo, ej. "Rechazar documento"). Transición de
 * color respeta `prefers-reduced-motion` globalmente (ver
 * `src/styles/theme.css`), no hace falta condicionarla aquí.
 */
export function Button({ variant = "primary", size = "md", className = "", disabled, ...props }: ButtonProps) {
  return (
    <button
      disabled={disabled}
      className={`rounded-md font-medium transition-colors duration-200 disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`}
      {...props}
    />
  );
}
