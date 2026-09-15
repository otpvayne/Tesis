/**
 * Mide field accuracy real de RF-003 (`invoice_es`) sin volver a correr el
 * pipeline OCR -- `decodeImage` requiere Canvas de navegador (Fase 4a),
 * no ejecutable en esta sesión, igual que `evaluateFieldExtraction`
 * (`modules/ocr/evaluation/field-extraction-metrics.ts`).
 *
 * En vez de eso, usa `document_validations` (RF-007, Fase 5): cada fila ya
 * tiene `original_extracted_data` (lo que el pipeline extrajo en su momento)
 * y `validated_data` (lo que un humano confirmó/corrigió) para una factura
 * real de Mansor -- exactamente el par `{extracted, expected}` que hace
 * falta, ya producido por uso real en producción.
 *
 * Limitación real, no oculta: un campo sin editar en `validated_data` puede
 * significar "ya estaba correcto" O "el revisor no lo miró" -- no hay
 * columna por-campo que distinga los dos casos (`document_validations` solo
 * guarda `manually_edited` a nivel de documento). Este script no puede
 * corregir ese sesgo; lo único honesto es reportarlo. `proveedor` es el
 * campo con más riesgo (texto libre, fácil de dejar sin revisar) --
 * se reporta aparte y se marca cuántas filas tienen el valor de
 * `proveedor` sin cambios respecto al original, como señal indirecta de
 * "probablemente no revisado".
 *
 * Uso: `npx tsx --env-file=.env.local bin/measure-field-accuracy.ts`
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/types/database";

const FIELDS = ["proveedor", "nit", "fecha", "iva", "valor", "total"] as const;
type Field = (typeof FIELDS)[number];
const NUMERIC_FIELDS = new Set<Field>(["iva", "valor", "total"]);
const NUMERIC_EPSILON = 0.005;

function valuesMatch(field: Field, actual: unknown, expected: unknown): boolean {
  if (actual === null || actual === undefined) return false;
  if (expected === null || expected === undefined) return false;
  if (NUMERIC_FIELDS.has(field)) {
    const a = Number(actual);
    const e = Number(expected);
    if (Number.isNaN(a) || Number.isNaN(e)) return false;
    return Math.abs(a - e) < NUMERIC_EPSILON;
  }
  return String(actual) === String(expected);
}

async function main() {
  const supabase = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await supabase
    .from("document_validations")
    .select("original_extracted_data, validated_data, documents!inner(document_type)")
    .eq("documents.document_type", "invoice_es");

  if (error) throw new Error(error.message);
  console.log(`Documentos validados reales (invoice_es): ${data.length}`);

  const stats = new Map<Field, { correct: number; total: number; skippedNoGroundTruth: number }>(
    FIELDS.map((f) => [f, { correct: 0, total: 0, skippedNoGroundTruth: 0 }]),
  );
  let proveedorUnchanged = 0;

  for (const row of data) {
    const original = row.original_extracted_data as Record<string, unknown>;
    const validated = row.validated_data as Record<string, unknown>;

    for (const field of FIELDS) {
      const expected = validated[field];
      const s = stats.get(field)!;
      if (expected === null || expected === undefined) {
        s.skippedNoGroundTruth++;
        continue;
      }
      s.total++;
      if (valuesMatch(field, original[field], expected)) s.correct++;
    }

    if (original.proveedor !== null && original.proveedor === validated.proveedor) proveedorUnchanged++;
  }

  console.log("");
  console.log("=== Field accuracy real (original_extracted_data vs validated_data) ===");
  let sumAccuracy = 0;
  let countable = 0;
  for (const field of FIELDS) {
    const s = stats.get(field)!;
    const acc = s.total > 0 ? (s.correct / s.total) * 100 : NaN;
    console.log(
      `${field.padEnd(10)}: ${s.total > 0 ? acc.toFixed(1) + "%" : "sin datos"} (${s.correct}/${s.total}, ${s.skippedNoGroundTruth} sin ground truth)`,
    );
    if (s.total > 0) {
      sumAccuracy += acc;
      countable++;
    }
  }
  console.log("");
  console.log(`Overall (promedio simple de los ${countable} campos con datos): ${(sumAccuracy / countable).toFixed(1)}%`);
  console.log("");
  console.log(
    `proveedor sin cambios respecto al original en ${proveedorUnchanged}/${data.length} filas -- señal de que probablemente no fue revisado en esos casos (no confirmación real de que estuviera correcto).`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
