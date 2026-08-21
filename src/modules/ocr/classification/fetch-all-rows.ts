/**
 * PostgREST (Supabase) corta cualquier `.select()` sin `.range()` en la
 * fila 1000 por defecto (`db.max_rows`, sin configurar en este proyecto)
 * -- sin avisar, sin error, simplemente devuelve una página parcial. Bug
 * real encontrado el 2026-08-21: con `ocr_training_samples` ya en >3000
 * filas, `getDatasetStats`/`trainAndEvaluateModel` venían leyendo solo un
 * subconjunto arbitrario de hasta 1000 -- la grilla de progreso por clase
 * de `/ocr-lab/train` parecía "no actualizarse" al guardar porque
 * `stats.byLabel` nunca reflejaba las filas más allá de la 1000, y
 * `trainAndEvaluateModel` habría entrenado/evaluado sobre datos
 * incompletos sin ningún aviso.
 */
export const SUPABASE_PAGE_SIZE = 1000;

/**
 * Trae todas las páginas de una consulta paginada por `.range(from, to)`,
 * repitiendo hasta que una página vuelva con menos de `pageSize` filas
 * (fin del resultado). `fetchPage` recibe el `[from, to]` inclusive de
 * cada página -- pensado para pasar directamente el builder de Supabase
 * con `.range()` ya encadenado, pero no depende de Supabase (cualquier
 * fuente paginada del mismo estilo sirve, de ahí que viva fuera de
 * `training-actions.ts` y sea testeable sin un cliente real).
 */
export async function fetchAllRows<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize: number = SUPABASE_PAGE_SIZE,
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) {
      throw new Error(`No se pudo leer el dataset: ${error.message}`);
    }
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}
