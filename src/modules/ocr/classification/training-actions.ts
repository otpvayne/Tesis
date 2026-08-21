"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/modules/audit/log";
import { fetchAllRows } from "@/modules/ocr/classification/fetch-all-rows";
import { KNNClassifier, type SerializedKNNClassifier } from "@/modules/ocr/classification/knn-classifier";
import { computeCharacterMetrics, type CharacterMetrics } from "@/modules/ocr/evaluation/character-metrics";
import {
  DATASET_PARTITIONS,
  type DatasetStats,
  type LabeledSampleInput,
  type OcrModelSummary,
  type SaveLabeledSamplesResult,
  type SaveSyntheticModelInput,
  type SaveSyntheticModelResult,
  type TrainAndEvaluateResult,
} from "@/modules/ocr/classification/training-types";
import type { Json } from "@/types/database";

/**
 * Único perfil OCR soportado por ahora (`CLAUDE.md` §7: "por ahora solo
 * `invoice_es`") — no se generaliza a un parámetro hasta que exista un
 * segundo perfil real que lo justifique.
 */
const DOCUMENT_TYPE = "invoice_es";

/** `0-9`, `A-Z`, `a-z` — el alfabeto inicial de `CLAUDE.md` §7. */
const VALID_LABEL_PATTERN = /^[0-9A-Za-z]$/;

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("No autenticado.");
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "ADMIN") {
    throw new Error("Solo ADMIN puede usar OCR LAB Training.");
  }

  return { supabase, userId: user.id };
}

/**
 * Lee todas las muestras de `document_type` y agrega en memoria. Pagina
 * con `fetchAllRows` (ver comentario ahí) -- si el volumen crece lo
 * suficiente para que traer todas las filas a memoria en cada carga de
 * `/ocr-lab/train` importe de verdad, se reemplaza por una agregación
 * real en SQL (`group by`), no antes.
 */
export async function getDatasetStats(): Promise<DatasetStats> {
  const { supabase } = await requireAdmin();

  const data = await fetchAllRows((from, to) =>
    supabase.from("ocr_training_samples").select("label, dataset_partition").eq("document_type", DOCUMENT_TYPE).range(from, to),
  );

  const byLabel: Record<string, number> = {};
  const byPartition: Record<string, number> = {};
  for (const row of data) {
    byLabel[row.label] = (byLabel[row.label] ?? 0) + 1;
    byPartition[row.dataset_partition] = (byPartition[row.dataset_partition] ?? 0) + 1;
  }

  return { total: data.length, byLabel, byPartition };
}

export async function saveLabeledSamples(samples: LabeledSampleInput[]): Promise<SaveLabeledSamplesResult> {
  const { supabase } = await requireAdmin();

  if (samples.length === 0) {
    return { saved: 0 };
  }

  for (const sample of samples) {
    if (!VALID_LABEL_PATTERN.test(sample.label)) {
      throw new Error(`Label inválida: "${sample.label}" (debe ser un solo carácter 0-9/A-Z/a-z).`);
    }
    if (!DATASET_PARTITIONS.includes(sample.partition)) {
      throw new Error(`Partición inválida: "${sample.partition}".`);
    }
  }

  const rows = samples.map((sample) => ({
    document_type: DOCUMENT_TYPE,
    label: sample.label,
    dataset_partition: sample.partition,
    feature_data: { descriptor: sample.descriptor, sourceDocument: sample.sourceDocument } as Json,
  }));

  const { error } = await supabase.from("ocr_training_samples").insert(rows);
  if (error) {
    throw new Error(`No se pudieron guardar las muestras: ${error.message}`);
  }

  revalidatePath("/ocr-lab/train");
  return { saved: rows.length };
}

/**
 * Entrena un kNN sobre la partición `train` y evalúa sobre `test`
 * (`validation` no se toca aquí — se reserva para calibrar `k`/`epsilon`
 * en Fase 4d, no para medir accuracy). `test` nunca participa del
 * entrenamiento (`CLAUDE.md` §7/§10).
 *
 * kNN es "lazy": no hay pesos que ajustar, el "modelo entrenado" es
 * literalmente el conjunto de muestras. `model_data` persiste
 * `{ descriptors, labels }` tal cual — suficiente para reconstruir el
 * `KNNClassifier` sin re-extraer HOG.
 */
export async function trainAndEvaluateModel(): Promise<TrainAndEvaluateResult> {
  const { supabase } = await requireAdmin();

  const rows = await fetchAllRows((from, to) =>
    supabase.from("ocr_training_samples").select("label, dataset_partition, feature_data").eq("document_type", DOCUMENT_TYPE).range(from, to),
  );

  const trainRows = rows.filter((row) => row.dataset_partition === "train");
  const testRows = rows.filter((row) => row.dataset_partition === "test");

  if (trainRows.length === 0) {
    throw new Error("No hay muestras en la partición 'train' todavía — etiqueta y guarda caracteres primero.");
  }

  const toDescriptor = (featureData: Json): Float32Array => {
    const parsed = featureData as { descriptor?: number[] };
    if (!Array.isArray(parsed.descriptor)) {
      throw new Error("Una muestra tiene feature_data corrupto (sin 'descriptor').");
    }
    return new Float32Array(parsed.descriptor);
  };

  const knn = new KNNClassifier();
  knn.train(
    trainRows.map((row) => toDescriptor(row.feature_data)),
    trainRows.map((row) => row.label),
  );

  let accuracy: number | null = null;
  if (testRows.length > 0) {
    let correct = 0;
    for (const row of testRows) {
      const prediction = knn.predict(toDescriptor(row.feature_data));
      if (prediction.label === row.label) correct++;
    }
    accuracy = correct / testRows.length;
  }

  const classes = new Set(trainRows.map((row) => row.label)).size;
  const version = new Date().toISOString();

  const { data: inserted, error: insertError } = await supabase
    .from("ocr_models")
    .insert({
      document_type: DOCUMENT_TYPE,
      version,
      active: false,
      // knn.toJSON() (Fase 4d) -- antes se armaba {descriptors, labels} a
      // mano aquí mismo (previo a que existiera esa serialización), dos
      // formas distintas del mismo model_data según de qué función salía.
      // Unificado en Fase 4f al notar la inconsistencia al escribir la
      // evaluación (necesita leer cualquier modelo activo con una sola
      // forma esperada).
      model_data: knn.toJSON() as unknown as Json,
      metrics: { accuracy, trainCount: trainRows.length, testCount: testRows.length, classes } as Json,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    throw new Error(`No se pudo guardar el modelo: ${insertError?.message ?? "sin fila devuelta"}`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    await logAuditEvent(supabase, {
      actorId: user.id,
      action: "MODEL_TRAINED",
      metadata: { document_type: DOCUMENT_TYPE, version, accuracy, trainCount: trainRows.length, testCount: testRows.length },
    });
  }

  revalidatePath("/ocr-lab/train");

  return { trainCount: trainRows.length, testCount: testRows.length, classes, accuracy, modelId: inserted.id };
}

/**
 * Persiste un modelo entrenado con dataset **sintético** (Fase 4d,
 * `synthesizeDataset` + `trainModel`, corridos enteramente en el
 * navegador — requieren Canvas/fuentes reales, ver
 * `dataset-synthesizer.ts`). Misma tabla que `trainAndEvaluateModel`
 * (`ocr_models`), `version` prefijada `synthetic-` para distinguirlo a
 * simple vista de un modelo entrenado con dataset real etiquetado en OCR
 * LAB. `active: false` — activar un modelo es una decisión aparte
 * (`MODEL_ACTIVATED`), no automática al entrenar.
 */
export async function saveSyntheticModel(input: SaveSyntheticModelInput): Promise<SaveSyntheticModelResult> {
  const { supabase } = await requireAdmin();

  let parsedModel: Json;
  try {
    parsedModel = JSON.parse(input.modelJson);
  } catch {
    throw new Error("modelJson inválido — no es JSON parseable.");
  }

  const version = `synthetic-${new Date().toISOString()}`;

  const { data: inserted, error } = await supabase
    .from("ocr_models")
    .insert({
      document_type: DOCUMENT_TYPE,
      version,
      active: false,
      model_data: parsedModel,
      metrics: { ...input.metrics, source: "synthetic" } as Json,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    throw new Error(`No se pudo guardar el modelo sintético: ${error?.message ?? "sin fila devuelta"}`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    await logAuditEvent(supabase, {
      actorId: user.id,
      action: "MODEL_TRAINED",
      metadata: { document_type: DOCUMENT_TYPE, version, source: "synthetic", ...input.metrics },
    });
  }

  revalidatePath("/ocr-lab/train");
  return { modelId: inserted.id, version };
}

/**
 * Activa un modelo (`GET /api/ocr/active-model`, Fase 4e, lo lee) —
 * ninguna de las dos funciones de entrenamiento de arriba activa el
 * modelo que produce, a propósito (`MODEL_TRAINED` ≠ `MODEL_ACTIVATED`,
 * decisión explícita). Sin esto, `/documents/[id]` nunca tendría un
 * modelo que usar: se agregó al notar el hueco al cablear Fase 4e, no
 * estaba en el prompt original de esta fase.
 *
 * Desactiva primero todos los demás modelos de `document_type` y luego
 * activa el pedido (dos updates, no uno) para no violar nunca, ni
 * transitoriamente, el índice único parcial `ocr_models_one_active_per_type`.
 */
export async function activateModel(modelId: string): Promise<void> {
  const { supabase, userId } = await requireAdmin();

  const { data: model, error: fetchError } = await supabase
    .from("ocr_models")
    .select("id, document_type, version")
    .eq("id", modelId)
    .single();
  if (fetchError || !model) {
    throw new Error(`Modelo no encontrado: ${fetchError?.message ?? modelId}`);
  }

  const { error: deactivateError } = await supabase
    .from("ocr_models")
    .update({ active: false })
    .eq("document_type", model.document_type)
    .neq("id", modelId);
  if (deactivateError) {
    throw new Error(`No se pudo desactivar el modelo anterior: ${deactivateError.message}`);
  }

  const { error: activateError } = await supabase.from("ocr_models").update({ active: true }).eq("id", modelId);
  if (activateError) {
    throw new Error(`No se pudo activar el modelo: ${activateError.message}`);
  }

  await logAuditEvent(supabase, {
    actorId: userId,
    action: "MODEL_ACTIVATED",
    metadata: { document_type: model.document_type, version: model.version, modelId },
  });

  revalidatePath("/ocr-lab/train");
  revalidatePath("/admin/models");
}

/**
 * Desactiva un modelo sin activar ningún otro en su lugar -- a diferencia
 * de `activateModel`, que siempre deja exactamente uno activo por
 * `document_type`, esto puede dejar un `document_type` sin ningún modelo
 * activo a propósito (ej. el admin decide que ninguno de los disponibles
 * sirve todavía). `/api/ocr/active-model` ya maneja ese caso con un 404
 * explícito.
 */
export async function deactivateModel(modelId: string): Promise<void> {
  const { supabase, userId } = await requireAdmin();

  const { data: model, error: fetchError } = await supabase.from("ocr_models").select("id, document_type, version").eq("id", modelId).single();
  if (fetchError || !model) {
    throw new Error(`Modelo no encontrado: ${fetchError?.message ?? modelId}`);
  }

  const { error: updateError } = await supabase.from("ocr_models").update({ active: false }).eq("id", modelId);
  if (updateError) {
    throw new Error(`No se pudo desactivar el modelo: ${updateError.message}`);
  }

  await logAuditEvent(supabase, {
    actorId: userId,
    action: "MODEL_DEACTIVATED",
    metadata: { document_type: model.document_type, version: model.version, modelId },
  });

  revalidatePath("/ocr-lab/train");
  revalidatePath("/admin/models");
}

/** Lista todos los modelos de `document_type="invoice_es"` (activos e históricos) para `/admin/models` -- sin `model_data`, puede pesar bastante y la vista de lista no lo necesita. */
export async function listAllModels(): Promise<OcrModelSummary[]> {
  const { supabase } = await requireAdmin();

  const { data, error } = await supabase.from("ocr_models").select("id, document_type, version, active, created_at, metrics").eq("document_type", DOCUMENT_TYPE).order("created_at", { ascending: false });

  if (error) {
    throw new Error(`No se pudieron listar los modelos: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    documentType: row.document_type,
    version: row.version,
    active: row.active,
    createdAt: row.created_at,
    metrics: (row.metrics ?? {}) as OcrModelSummary["metrics"],
  }));
}

export interface CharacterEvaluationResult {
  metrics: CharacterMetrics;
  modelVersion: string;
  modelId: string;
}

/**
 * Evalúa el modelo **activo** contra la partición `test` real de
 * `ocr_training_samples` (Fase 4f) — nunca `train`/`validation`
 * (`CLAUDE.md` §7/§10). `ocr_training_samples.feature_data` guarda el
 * descriptor HOG ya extraído (no `ImageData`), así que se predice
 * directamente con `KNNClassifier.predict(descriptor)` — de ahí
 * `computeCharacterMetrics` (la mitad "pura" de `character-metrics.ts`,
 * sin pasar por `CharacterClassifier`/`extractHOG`, que necesitarían una
 * imagen que no existe aquí).
 *
 * Si `test` está vacío (nadie ha etiquetado facturas reales todavía —
 * estado real de este proyecto en Fase 4f), lanza un error explícito en
 * vez de devolver una métrica sobre 0 casos disfrazada de resultado real.
 */
export async function evaluateActiveModelOnTestPartition(): Promise<CharacterEvaluationResult> {
  const { supabase } = await requireAdmin();

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
    throw new Error(`No hay un modelo activo para document_type="${DOCUMENT_TYPE}" — activa uno primero.`);
  }

  const testRows = await fetchAllRows((from, to) =>
    supabase.from("ocr_training_samples").select("label, feature_data").eq("document_type", DOCUMENT_TYPE).eq("dataset_partition", "test").range(from, to),
  );

  if (testRows.length === 0) {
    throw new Error("La partición 'test' está vacía todavía — etiqueta y guarda caracteres con partición 'test' en OCR LAB antes de evaluar.");
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

  return {
    metrics: computeCharacterMetrics(predictions),
    modelVersion: activeModel.version,
    modelId: activeModel.id,
  };
}
