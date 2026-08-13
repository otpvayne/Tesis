/**
 * Genera un dataset sintético (Fase 4d, mismo código que `/ocr-lab/train` —
 * `synthesizeDataset` + `trainModel`) enteramente en Node, usando
 * `nodeCharacterRenderer` (node-canvas) en vez del `renderCharacterGlyph`
 * de navegador, entrena un kNN, lo guarda en `ocr_models` y lo activa.
 *
 * Por qué existe: al cerrar Fase 5 se confirmó contra el proyecto Supabase
 * real que `ocr_training_samples` y `ocr_models` estaban completamente
 * vacías — nadie había podido correr `/ocr-lab/train` en un navegador
 * real todavía, así que "Procesar documento" en `/documents/[id]` siempre
 * fallaba con 404. Este script produce un modelo sintético **real** (no
 * datos inventados a mano) para desbloquear la funcionalidad de punta a
 * punta mientras el equipo etiqueta facturas reales de Mansor por su
 * cuenta (ver `README.md`, sección de pendientes).
 *
 * Uso: `npm run generate:model` (carga `.env.local` vía `--env-file`,
 * necesita `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`).
 */
import { createClient } from "@supabase/supabase-js";
import type { Database, Json } from "../src/types/database";
import { synthesizeDataset } from "../src/modules/ocr/classification/dataset-synthesizer";
import { trainModel } from "../src/modules/ocr/classification/model-trainer";
import { serializeModel } from "../src/modules/ocr/classification/model-persistence";
import { OCR_TRAINING_CONFIG } from "../src/modules/ocr/config";
import { nodeCharacterRenderer } from "../src/modules/ocr/training/node-character-renderer";

const DOCUMENT_TYPE = "invoice_es";

/** `0-9`, `A-Z`, `a-z` -- el alfabeto de `CLAUDE.md` §7. */
const ALPHABET = [
  ...Array.from({ length: 10 }, (_, i) => String(i)),
  ...Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)),
  ...Array.from({ length: 26 }, (_, i) => String.fromCharCode(97 + i)),
];

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name} -- corre con: npm run generate:model (usa --env-file=.env.local)`);
  }
  return value;
}

async function main() {
  const supabase = createClient<Database>(requireEnv("NEXT_PUBLIC_SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(`Sintetizando dataset: ${ALPHABET.length} caracteres x ${OCR_TRAINING_CONFIG.SYNTHETIC_SAMPLES_PER_CHARACTER} muestras/carácter...`);
  const dataset = synthesizeDataset(
    {
      charactersToGenerate: ALPHABET,
      samplesPerCharacter: OCR_TRAINING_CONFIG.SYNTHETIC_SAMPLES_PER_CHARACTER,
      imageSize: 32,
      fonts: [...OCR_TRAINING_CONFIG.SYNTHETIC_FONTS],
      distortions: {
        rotationRange: OCR_TRAINING_CONFIG.DISTORTION_ROTATION_RANGE,
        scaleRange: OCR_TRAINING_CONFIG.DISTORTION_SCALE_RANGE,
        noiseLevel: OCR_TRAINING_CONFIG.DISTORTION_NOISE_LEVEL,
        skewRange: OCR_TRAINING_CONFIG.DISTORTION_SKEW_RANGE,
      },
    },
    { renderer: nodeCharacterRenderer },
  );
  console.log(`Dataset generado: ${dataset.samples.length} muestras.`);

  console.log("Entrenando kNN (split estratificado 80/20, evaluando en el 20%)...");
  const trained = trainModel(dataset, OCR_TRAINING_CONFIG.KNN_K, OCR_TRAINING_CONFIG.TRAIN_TEST_SPLIT);
  const accuracyLabel = trained.metrics.accuracy === null ? "sin muestras de test" : `${(trained.metrics.accuracy * 100).toFixed(1)}%`;
  console.log(
    `Entrenado: accuracy=${accuracyLabel} (train=${trained.metrics.trainCount}, test=${trained.metrics.testCount}, ${trained.metrics.labels.length} clases, ${trained.trainingTime.toFixed(0)}ms)`,
  );
  if (trained.generalizationWarning) {
    console.warn(`⚠ ${trained.generalizationWarning}`);
  }

  const metrics = {
    accuracy: trained.metrics.accuracy,
    trainCount: trained.metrics.trainCount,
    testCount: trained.metrics.testCount,
    classes: trained.metrics.labels.length,
    trainingTimeMs: trained.trainingTime,
  };

  const modelJson = serializeModel(trained.model);
  const version = `synthetic-node-${new Date().toISOString()}`;

  const { data: inserted, error: insertError } = await supabase
    .from("ocr_models")
    .insert({
      document_type: DOCUMENT_TYPE,
      version,
      active: false,
      model_data: JSON.parse(modelJson) as Json,
      metrics: { ...metrics, source: "synthetic-node-script" } as Json,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    throw new Error(`No se pudo guardar el modelo: ${insertError?.message ?? "sin fila devuelta"}`);
  }
  console.log(`Modelo guardado en ocr_models: id=${inserted.id}, version=${version}`);

  // Mismo orden que activateModel() en training-actions.ts: desactivar
  // primero, activar después -- nunca viola, ni transitoriamente, el
  // índice único parcial ocr_models_one_active_per_type.
  const { error: deactivateError } = await supabase.from("ocr_models").update({ active: false }).eq("document_type", DOCUMENT_TYPE).neq("id", inserted.id);
  if (deactivateError) {
    throw new Error(`No se pudo desactivar modelos anteriores: ${deactivateError.message}`);
  }

  const { error: activateError } = await supabase.from("ocr_models").update({ active: true }).eq("id", inserted.id);
  if (activateError) {
    throw new Error(`No se pudo activar el modelo: ${activateError.message}`);
  }
  console.log(`Modelo activado para document_type="${DOCUMENT_TYPE}" -- /api/ocr/active-model ya puede servirlo.`);

  const { data: adminProfile } = await supabase.from("profiles").select("id").eq("role", "ADMIN").limit(1).maybeSingle();
  if (adminProfile) {
    const { error: auditError } = await supabase.from("audit_logs").insert([
      { actor_id: adminProfile.id, action: "MODEL_TRAINED", metadata: { document_type: DOCUMENT_TYPE, version, source: "synthetic-node-script", ...metrics } as Json },
      { actor_id: adminProfile.id, action: "MODEL_ACTIVATED", metadata: { document_type: DOCUMENT_TYPE, version, modelId: inserted.id } as Json },
    ]);
    if (auditError) {
      console.warn(`No se pudo registrar en audit_logs (no bloqueante): ${auditError.message}`);
    }
  } else {
    console.warn("No se encontró ningún perfil ADMIN -- se omite el registro en audit_logs (no bloqueante).");
  }

  console.log("Listo. /documents/[id] ya puede usar 'Procesar documento (OCR)'.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
