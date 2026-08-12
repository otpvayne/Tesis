import { runOCRPipelineOnImageData } from "@/modules/ocr/pipeline/ocr-pipeline";
import { extractFields, type ExtractedFields } from "@/modules/ocr/classification/field-extraction";
import type { CharacterClassifier } from "@/modules/ocr/classification/character-classifier";

const FIELD_NAMES = ["proveedor", "nit", "fecha", "iva", "valor", "total"] as const;
const NUMERIC_FIELD_NAMES = ["iva", "valor", "total"] as const;

export interface ReproducibilityResult {
  /** Siempre `true` por construcción — todas las corridas reciben la misma referencia de `ImageData`, no una copia. */
  sameImage: boolean;
  sameOCRText: boolean;
  sameExtractedFields: boolean;
  /** Fracción de las `runs` corridas cuyo texto y campos coinciden exactamente con la primera — `1` = 100% reproducible. */
  confidence: number;
  variance: {
    /** Varianza poblacional de `OCRResult.confidence` entre corridas. */
    characterConfidence: number;
    /** Varianza poblacional de los valores numéricos extraídos (`iva`/`valor`/`total`) entre corridas — solo si las `runs` coincidieron en si el campo se encontró o no; si una corrida lo encuentra y otra no, eso ya lo refleja `sameExtractedFields=false`, no una varianza numérica. */
    fieldValues: number;
  };
}

function variance(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  return values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
}

function fieldsMatch(a: ExtractedFields, b: ExtractedFields): boolean {
  return FIELD_NAMES.every((field) => a[field].value === b[field].value);
}

/**
 * Corre el pipeline completo + extracción sobre la **misma** `ImageData`
 * `runs` veces y verifica que el resultado sea idéntico — el pipeline
 * (Fase 4a→4e) no tiene ninguna fuente de aleatoriedad (`Math.random`,
 * timers, IDs) en el camino de reconocimiento: `100%` de reproducibilidad
 * es lo esperado por construcción, no una casualidad a confirmar con
 * datos reales. `classifier` no está en la firma original de esta fase
 * (el pseudocódigo asumía un modelo cargado implícitamente) — se agrega
 * explícito, como en el resto de funciones de este módulo.
 */
export function testReproducibility(testImage: ImageData, classifier: CharacterClassifier, runs: number = 5): ReproducibilityResult {
  if (runs < 1) {
    throw new Error("testReproducibility: runs debe ser >= 1.");
  }

  const results = Array.from({ length: runs }, () => {
    const ocrResult = runOCRPipelineOnImageData(testImage, classifier);
    const fields = extractFields(ocrResult);
    return { ocrResult, fields };
  });

  const first = results[0];
  const sameOCRText = results.every((r) => r.ocrResult.rawText === first.ocrResult.rawText);
  const sameExtractedFields = results.every((r) => fieldsMatch(r.fields, first.fields));

  const matchingRuns = results.filter(
    (r) => r.ocrResult.rawText === first.ocrResult.rawText && fieldsMatch(r.fields, first.fields),
  ).length;

  const characterConfidenceVariance = variance(results.map((r) => r.ocrResult.confidence));

  const numericFieldValues: number[] = [];
  for (const field of NUMERIC_FIELD_NAMES) {
    const values = results.map((r) => r.fields[field].value);
    if (values.every((v): v is number => v !== null)) {
      numericFieldValues.push(...values);
    }
  }

  return {
    sameImage: true,
    sameOCRText,
    sameExtractedFields,
    confidence: matchingRuns / runs,
    variance: {
      characterConfidence: characterConfidenceVariance,
      fieldValues: variance(numericFieldValues),
    },
  };
}
