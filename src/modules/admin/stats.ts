import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { VALIDATION_FIELDS, type ValidationFieldName } from "@/modules/documents/validation-types";

export interface FieldEditStats {
  editedFieldsCount: Record<ValidationFieldName, number>;
  totalFieldsEdited: number;
}

interface DiffableValidationRow {
  original_extracted_data: unknown;
  validated_data: unknown;
}

/**
 * Cuenta, campo por campo, cuántas validaciones tienen un valor distinto
 * entre lo extraído por OCR y lo confirmado por el usuario -- comparando
 * las dos columnas JSONB de `document_validations` directamente, no un
 * contador separado (mismo criterio que `/admin/validation-dashboard`,
 * Fase 5; extraído aquí porque el dashboard admin de Fase 6 necesita el
 * mismo cálculo).
 */
export function computeFieldEditStats(rows: DiffableValidationRow[]): FieldEditStats {
  const editedFieldsCount = { proveedor: 0, nit: 0, fecha: 0, iva: 0, valor: 0, total: 0 } as Record<ValidationFieldName, number>;

  for (const row of rows) {
    const original = (row.original_extracted_data ?? {}) as Partial<Record<ValidationFieldName, unknown>>;
    const validated = (row.validated_data ?? {}) as Partial<Record<ValidationFieldName, unknown>>;
    for (const field of VALIDATION_FIELDS) {
      if (JSON.stringify(original[field] ?? null) !== JSON.stringify(validated[field] ?? null)) {
        editedFieldsCount[field] += 1;
      }
    }
  }

  const totalFieldsEdited = Object.values(editedFieldsCount).reduce((a, b) => a + b, 0);
  return { editedFieldsCount, totalFieldsEdited };
}

export interface DayBucket {
  date: string;
  count: number;
}

/**
 * Agrupa timestamps ISO por fecha (`yyyy-mm-dd`, en UTC) sobre los
 * últimos `days` días (incluyendo hoy), rellenando con `0` los días sin
 * datos -- para que el gráfico de barras siempre tenga `days` puntos, no
 * solo los días con actividad.
 */
export function bucketByDay(timestamps: string[], days: number, now: Date = new Date()): DayBucket[] {
  const buckets: DayBucket[] = [];
  const counts = new Map<string, number>();

  for (const ts of timestamps) {
    const day = ts.slice(0, 10);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    const key = d.toISOString().slice(0, 10);
    buckets.push({ date: key, count: counts.get(key) ?? 0 });
  }

  return buckets;
}

export interface ValidatorStat {
  userId: string;
  email: string | null;
  totalValidations: number;
  editedValidations: number;
}

interface ValidatorRow {
  validated_by: string;
  manually_edited: boolean;
  validator?: { email: string } | null;
}

/** Agrupa validaciones por quien las hizo -- "ediciones por usuario" del enunciado de Fase 6. Orden descendente por total de validaciones. */
export function computeValidatorStats(rows: ValidatorRow[]): ValidatorStat[] {
  const byUser = new Map<string, ValidatorStat>();

  for (const row of rows) {
    const existing = byUser.get(row.validated_by) ?? {
      userId: row.validated_by,
      email: row.validator?.email ?? null,
      totalValidations: 0,
      editedValidations: 0,
    };
    existing.totalValidations += 1;
    if (row.manually_edited) existing.editedValidations += 1;
    byUser.set(row.validated_by, existing);
  }

  return Array.from(byUser.values()).sort((a, b) => b.totalValidations - a.totalValidations);
}

export interface EditTrendPoint {
  date: string;
  total: number;
  /** `0` tanto si no hubo ediciones como si no hubo validaciones ese día -- `total` distingue ambos casos. */
  editedPercentage: number;
}

interface TrendableValidationRow {
  validated_at: string;
  manually_edited: boolean;
}

/**
 * % de validaciones con al menos un campo editado, por día, sobre los
 * últimos `days` días -- real, calculado de `document_validations`, no
 * los números de ejemplo del enunciado ("hace 7 días: 40%..."). Días sin
 * ninguna validación quedan en `0%` con `total: 0` (distinto de "0% de
 * error", que sería `total > 0` y `editedPercentage: 0`).
 */
export function computeEditTrend(rows: TrendableValidationRow[], days: number, now: Date = new Date()): EditTrendPoint[] {
  const byDay = new Map<string, { total: number; edited: number }>();

  for (const row of rows) {
    const day = row.validated_at.slice(0, 10);
    const bucket = byDay.get(day) ?? { total: 0, edited: 0 };
    bucket.total += 1;
    if (row.manually_edited) bucket.edited += 1;
    byDay.set(day, bucket);
  }

  const points: EditTrendPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    const key = d.toISOString().slice(0, 10);
    const bucket = byDay.get(key);
    points.push({
      date: key,
      total: bucket?.total ?? 0,
      editedPercentage: bucket && bucket.total > 0 ? (bucket.edited / bucket.total) * 100 : 0,
    });
  }

  return points;
}

export interface AdminDashboardStats {
  totalDocuments: number;
  validatedDocuments: number;
  validationPercentage: number;
  /** Promedio de `ocr_results.confidence` -- confidence real del pipeline, NO accuracy medida (esa vive en `docs/ocr/evaluation.md`, requiere partición `test` real). `null` si no hay ningún `ocr_results` todavía. */
  averageConfidence: number | null;
  activeUsers: number;
  activeModels: number;
  totalFieldsEdited: number;
  documentsPerDay: DayBucket[];
}

/**
 * Agrega las estadísticas del dashboard admin (`/admin`) desde datos
 * reales -- ninguna cifra aquí es de ejemplo/estimada. `activeUsers` se
 * define como usuarios distintos con al menos un documento subido (no hay
 * columna de "último login" para una definición más estricta).
 */
export async function getAdminDashboardStats(supabase: SupabaseClient<Database>): Promise<AdminDashboardStats> {
  const [documentsResult, validatedResult, confidenceResult, validationsResult, modelsResult] = await Promise.all([
    supabase.from("documents").select("owner_id, created_at", { count: "exact" }),
    supabase.from("documents").select("id", { count: "exact", head: true }).eq("status", "validated"),
    supabase.from("ocr_results").select("confidence").not("confidence", "is", null),
    supabase.from("document_validations").select("original_extracted_data, validated_data"),
    supabase.from("ocr_models").select("id", { count: "exact", head: true }).eq("active", true),
  ]);

  if (documentsResult.error) throw new Error(`No se pudieron leer documentos: ${documentsResult.error.message}`);
  if (validatedResult.error) throw new Error(`No se pudieron contar documentos validados: ${validatedResult.error.message}`);
  if (confidenceResult.error) throw new Error(`No se pudo leer confidence de ocr_results: ${confidenceResult.error.message}`);
  if (validationsResult.error) throw new Error(`No se pudieron leer document_validations: ${validationsResult.error.message}`);
  if (modelsResult.error) throw new Error(`No se pudieron contar modelos activos: ${modelsResult.error.message}`);

  const totalDocuments = documentsResult.count ?? 0;
  const validatedDocuments = validatedResult.count ?? 0;
  const validationPercentage = totalDocuments > 0 ? (validatedDocuments / totalDocuments) * 100 : 0;

  const confidences = (confidenceResult.data ?? []).map((r) => r.confidence).filter((c): c is number => c !== null);
  const averageConfidence = confidences.length > 0 ? confidences.reduce((a, b) => a + b, 0) / confidences.length : null;

  const activeUsers = new Set((documentsResult.data ?? []).map((d) => d.owner_id)).size;

  const { totalFieldsEdited } = computeFieldEditStats(validationsResult.data ?? []);

  const documentsPerDay = bucketByDay((documentsResult.data ?? []).map((d) => d.created_at), 7);

  return {
    totalDocuments,
    validatedDocuments,
    validationPercentage,
    averageConfidence,
    activeUsers,
    activeModels: modelsResult.count ?? 0,
    totalFieldsEdited,
    documentsPerDay,
  };
}
