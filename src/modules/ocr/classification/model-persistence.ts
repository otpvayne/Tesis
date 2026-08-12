import { CharacterClassifier } from "@/modules/ocr/classification/character-classifier";

/**
 * Serializa/deserializa un `CharacterClassifier` a JSON — funciones puras,
 * sin dependencia de Supabase ni de navegador, para poder testearlas
 * directamente.
 *
 * **Desviación del prompt de esta fase:** se pidió guardar/cargar desde un
 * bucket de Supabase Storage (`ocr-models/model-knn.json`). Ese bucket no
 * existe (solo existe `documents`, ver
 * `supabase/migrations/20260811205322_create_documents_storage_bucket.sql`)
 * y crearlo requeriría una migración + políticas RLS nuevas — cambio de
 * infraestructura que no corresponde decidir unilateralmente. La tabla
 * `ocr_models` (columna `model_data jsonb`) **ya existe y ya se usa** para
 * esto exactamente (`training-actions.ts`, Fase 4c: `trainAndEvaluateModel`
 * guarda ahí el modelo entrenado con datos reales etiquetados). Guardar el
 * modelo sintético en un mecanismo de persistencia distinto (un bucket)
 * fragmentaría dónde vive "el modelo" según su origen, sin necesidad — se
 * usa la misma tabla vía `saveSyntheticModel` (`training-actions.ts`).
 */
export function serializeModel(classifier: CharacterClassifier): string {
  return JSON.stringify(classifier.toJSON());
}

export function deserializeModel(json: string): CharacterClassifier {
  return CharacterClassifier.fromJSON(JSON.parse(json));
}
