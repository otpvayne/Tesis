/**
 * Mide el accuracy real del modelo activo de `invoice_es` contra la
 * partición `test` real de `ocr_training_samples` -- mismo cálculo que
 * `evaluateActiveModelOnTestPartition` (`training-actions.ts`), pero esa
 * función vive detrás de `requireAdmin()` (sesión de navegador) y no se
 * puede invocar desde un script. Aquí se repite el mismo cuerpo con
 * `SUPABASE_SERVICE_ROLE_KEY` en vez de una sesión -- mismo patrón que
 * `bin/generate-initial-model.ts` / `bin/import-pdf-training-samples.ts`.
 *
 * Por qué existe: antes de expandir RF-003 a un perfil de contratos
 * (ver `docs/decisions/0003-perfil-ocr-contratos.md`), el equipo reportó
 * ~80% de accuracy con 16,500 caracteres reales como la señal que ya
 * cumplía el umbral que bloqueaba nuevos perfiles en `docs/roadmap.md` --
 * cifra no verificada por Claude en la sesión donde se reportó. Este
 * script produce una medición real, no reportada, para reemplazarla.
 *
 * Uso: `npm run verify:model-accuracy` (carga `.env.local` vía
 * `--env-file`, necesita `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`).
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/types/database";
import { fetchAllRows } from "../src/modules/ocr/classification/fetch-all-rows";
import { KNNClassifier, type SerializedKNNClassifier } from "../src/modules/ocr/classification/knn-classifier";
import { computeCharacterMetrics } from "../src/modules/ocr/evaluation/character-metrics";

const DOCUMENT_TYPE = "invoice_es";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name} -- corre con: npm run verify:model-accuracy (usa --env-file=.env.local)`);
  }
  return value;
}

async function main() {
  const supabase = createClient<Database>(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: activeModel, error: modelError } = await supabase
    .from("ocr_models")
    .select("id, version, model_data")
    .eq("document_type", DOCUMENT_TYPE)
    .eq("active", true)
    .maybeSingle();

  if (modelError) {
    throw new Error(`No se pudo leer el modelo activo: ${modelError.message}`);
  }
  if (!activeModel) {
    throw new Error(`No hay un modelo activo para document_type="${DOCUMENT_TYPE}".`);
  }

  console.log(`Modelo activo: id=${activeModel.id} version=${activeModel.version}`);

  const testRows = await fetchAllRows((from, to) =>
    supabase.from("ocr_training_samples").select("label, feature_data").eq("document_type", DOCUMENT_TYPE).eq("dataset_partition", "test").range(from, to),
  );

  console.log(`Muestras en partición 'test': ${testRows.length}`);

  if (testRows.length === 0) {
    throw new Error("La partición 'test' está vacía -- no hay nada real que medir.");
  }

  const knn = KNNClassifier.fromJSON(activeModel.model_data as unknown as SerializedKNNClassifier);

  const predictions = testRows.map((row) => {
    const parsed = row.feature_data as { descriptor?: number[] };
    if (!Array.isArray(parsed.descriptor)) {
      throw new Error("Una muestra de test tiene feature_data corrupto (sin 'descriptor').");
    }
    const prediction = knn.predict(new Float32Array(parsed.descriptor));
    return { expected: row.label, predicted: prediction.label };
  });

  const metrics = computeCharacterMetrics(predictions);

  console.log("");
  console.log("=== Resultado real (partición test, medido ahora) ===");
  console.log(`Accuracy: ${(metrics.accuracy * 100).toFixed(1)}% (${metrics.correctCharacters}/${metrics.totalCharactersProcessed})`);
  console.log(`Clases evaluadas: ${metrics.labels.length}`);
  console.log("Confusiones más frecuentes:", metrics.commonMisclassifications.slice(0, 10));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
