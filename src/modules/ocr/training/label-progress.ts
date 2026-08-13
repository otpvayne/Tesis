/**
 * `0-9`, `A-Z`, `a-z` — el alfabeto inicial de `CLAUDE.md` §7. Ya existe la
 * misma lista construida de la misma forma en `ocr-train-client.tsx`
 * (`LABEL_OPTIONS`, ahora reemplazado por esta exportación), como patrón
 * de validación en `training-actions.ts` (`VALID_LABEL_PATTERN`) y como
 * array en `bin/generate-initial-model.ts` — no se centralizan las otras
 * dos aquí porque tocar la validación del lado servidor y el script de
 * Fase 5 es un cambio más amplio del que esta mejora de UX de etiquetado
 * justifica por sí sola.
 */
export const OCR_ALPHABET: readonly string[] = [
  ...Array.from({ length: 10 }, (_, i) => String(i)),
  ...Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)),
  ...Array.from({ length: 26 }, (_, i) => String.fromCharCode(97 + i)),
];

/**
 * Meta de muestras por clase citada en el handoff de transición del
 * equipo (agosto 2026) y en el texto ya existente de `/ocr-lab/train`
 * (`page.tsx`, tip del `PageHero`: "100+ muestras por carácter... antes
 * del primer reentrenamiento con datos reales"). Centralizada aquí para
 * que la barra de progreso por clase y ese texto no puedan
 * desincronizarse en el futuro.
 */
export const LABELING_TARGET_PER_CLASS = 100;

export interface ClassProgress {
  label: string;
  savedCount: number;
  pendingCount: number;
  total: number;
  met: boolean;
}

/**
 * Combina lo ya guardado en `ocr_training_samples` (`savedByLabel`, viene
 * de `DatasetStats.byLabel`) con lo etiquetado en memoria en la sesión
 * actual de OCR LAB que todavía no se guardó (`pendingByLabel`). Sin
 * combinar ambos, el admin solo vería su progreso real *después* de hacer
 * clic en "Guardar etiquetas" — durante las horas que dura una sesión de
 * etiquetado (el handoff estima 4-6h para 62 clases × 100 muestras) no
 * tendría forma de saber si ya completó una clase o le sigue faltando.
 */
export function computeClassProgress(
  alphabet: readonly string[],
  savedByLabel: Record<string, number>,
  pendingByLabel: Record<string, number>,
  target: number = LABELING_TARGET_PER_CLASS,
): ClassProgress[] {
  return alphabet.map((label) => {
    const savedCount = savedByLabel[label] ?? 0;
    const pendingCount = pendingByLabel[label] ?? 0;
    const total = savedCount + pendingCount;
    return { label, savedCount, pendingCount, total, met: total >= target };
  });
}

/**
 * Cuenta, por label, cuántos caracteres del lote actual (todavía sin
 * guardar) ya tienen una etiqueta asignada — alimenta `computeClassProgress`
 * con el progreso "pendiente" en vivo mientras se etiqueta, antes de
 * guardar. Ignora los caracteres descartados (mala segmentación, ver
 * `findNextPendingIndex`) igual que sin etiquetar: ninguno de los dos
 * cuenta para la meta por clase.
 */
export function countPendingByLabel(
  items: ReadonlyArray<{ label: string; discarded: boolean }>,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const item of items) {
    if (item.discarded || item.label === "") continue;
    result[item.label] = (result[item.label] ?? 0) + 1;
  }
  return result;
}

/**
 * Busca, a partir de (sin incluir) `fromIndex`, el siguiente índice en
 * `items` cuyo carácter siga sin etiqueta y sin descartar — el
 * "auto-avance" del flujo de etiquetado por teclado
 * (`ocr-train-client.tsx`): escribir la letra/número correcto mueve el
 * foco solo al siguiente carácter pendiente, sin que el admin tenga que
 * hacer clic a mano en cada uno de los ~6200 caracteres que pide el
 * handoff (62 clases × 100 muestras).
 *
 * Búsqueda circular (recorre como máximo `items.length` posiciones desde
 * `fromIndex + 1`, con wrap-around al llegar al final) — si los últimos
 * caracteres de la grilla ya están etiquetados pero quedó alguno
 * pendiente más atrás (ej. el admin corrigió una etiqueta a mano con el
 * `<select>`, dejando un hueco), el auto-avance lo sigue encontrando en
 * vez de quedarse "atascado" al final sin más caracteres que ofrecer.
 * Devuelve `null` si no queda ningún carácter pendiente.
 */
export function findNextPendingIndex(
  items: ReadonlyArray<{ label: string; discarded: boolean }>,
  fromIndex: number,
): number | null {
  if (items.length === 0) return null;
  for (let step = 1; step <= items.length; step++) {
    const index = (fromIndex + step) % items.length;
    const item = items[index];
    if (!item.discarded && item.label === "") return index;
  }
  return null;
}
