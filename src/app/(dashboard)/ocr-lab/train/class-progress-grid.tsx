import type { ClassProgress } from "@/modules/ocr/training/label-progress";

/**
 * Grilla compacta de las 62 clases (`0-9 A-Z a-z`) con su progreso hacia
 * la meta de `LABELING_TARGET_PER_CLASS` muestras — responde en un
 * vistazo la pregunta que antes requería leer `stats.byLabel` a mano:
 * "¿qué clases ya están listas y cuáles siguen haciendo falta?". Incluye
 * lo guardado en BD *y* lo etiquetado en memoria sin guardar todavía
 * (`ClassProgress.pendingCount`, ver `computeClassProgress`), para que el
 * progreso se vea completo durante la sesión de etiquetado, no solo
 * después de cada "Guardar etiquetas".
 *
 * Solo lectura (sin `onClick` ni filtrado) a propósito — es un indicador
 * de progreso, no un selector de qué etiquetar a continuación (eso lo
 * decide el orden real de los caracteres segmentados de la imagen
 * cargada, vía el flujo de teclado de `ocr-train-client.tsx`).
 */
export function ClassProgressGrid({ progress }: { progress: ClassProgress[] }) {
  const completedCount = progress.filter((p) => p.met).length;

  return (
    <div className="flex flex-col gap-2 rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
      <p className="text-xs font-medium text-neutral-500 dark:text-neutral-500">
        Progreso por clase: {completedCount}/{progress.length} completas
      </p>
      <div className="grid grid-cols-8 gap-1 sm:grid-cols-10 md:grid-cols-12">
        {progress.map((entry) => (
          <div
            key={entry.label}
            title={`"${entry.label}": ${entry.total} muestra${entry.total === 1 ? "" : "s"}${entry.pendingCount > 0 ? ` (${entry.pendingCount} sin guardar)` : ""}`}
            className={`flex flex-col items-center rounded border px-1 py-0.5 text-[10px] leading-tight ${
              entry.met
                ? "border-emerald-500 bg-emerald-50 text-emerald-800 dark:border-emerald-400 dark:bg-emerald-950 dark:text-emerald-300"
                : entry.total > 0
                  ? "border-amber-400 bg-amber-50 text-amber-800 dark:border-amber-500 dark:bg-amber-950 dark:text-amber-300"
                  : "border-neutral-200 text-neutral-400 dark:border-neutral-800 dark:text-neutral-600"
            }`}
          >
            <span className="font-mono font-semibold">{entry.label}</span>
            <span>{entry.total}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
