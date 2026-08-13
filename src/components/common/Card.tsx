import type { HTMLAttributes, ReactNode } from "react";

export function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950 ${className}`} {...props} />;
}

export interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
  /** Tinta el valor con un color del sistema — usar para señalar que un KPI está en un estado bueno/de atención/crítico (ej. accuracy baja). Por defecto usa el color de texto neutro. */
  tone?: "brand" | "caution" | "critical" | "neutral";
}

const TONE_TEXT_CLASSES: Record<NonNullable<StatCardProps["tone"]>, string> = {
  brand: "text-brand-700 dark:text-brand-400",
  caution: "text-caution-700 dark:text-caution-400",
  critical: "text-critical-700 dark:text-critical-400",
  neutral: "text-neutral-900 dark:text-neutral-50",
};

/** Tarjeta de KPI (dashboards admin) — construida sobre `Card`, no una reimplementación paralela. */
export function StatCard({ label, value, hint, tone = "neutral" }: StatCardProps) {
  return (
    <Card>
      <p className="text-xs text-neutral-500 dark:text-neutral-500">{label}</p>
      <p className={`mt-1 font-display text-2xl font-semibold ${TONE_TEXT_CLASSES[tone]}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-500">{hint}</p> : null}
    </Card>
  );
}

export function CardHeader({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mb-3 flex items-center justify-between ${className}`}>{children}</div>;
}
