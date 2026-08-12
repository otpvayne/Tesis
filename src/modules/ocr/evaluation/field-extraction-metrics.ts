import { runOCRPipelineOnImageData } from "@/modules/ocr/pipeline/ocr-pipeline";
import { extractFields, type ExtractedFields } from "@/modules/ocr/classification/field-extraction";
import type { CharacterClassifier } from "@/modules/ocr/classification/character-classifier";

export type FieldName = "proveedor" | "nit" | "fecha" | "iva" | "valor" | "total";

export interface ExpectedFields {
  proveedor: string;
  nit: string;
  fecha: string;
  iva: number;
  valor: number;
  total: number;
}

export interface FieldTestDocument {
  imageData: ImageData;
  expectedFields: ExpectedFields;
}

export interface FieldMetrics {
  field: FieldName;
  /** Fracción de documentos donde el valor extraído coincide con el esperado. */
  accuracy: number;
  /** `TP / (TP + FP)` — de lo que se extrajo (no-null), cuánto era correcto. `1` si nunca hubo falsos positivos (incluye el caso sin ningún TP/FP). */
  precision: number;
  /** `TP / (TP + FN)` — de lo que debía extraerse, cuánto se extrajo correctamente. */
  recall: number;
  f1Score: number;
  /** Promedio del `confidence` reportado por `extractFields` para este campo, sobre todos los documentos (incluye los `confidence=0` de campos no encontrados — es la confianza real que devolvió el sistema, no solo de los aciertos). */
  confidence: number;
  examplesCorrect: number;
  examplesIncorrect: number;
}

export interface CommonError {
  field: FieldName;
  /** `"missing"` (no se extrajo ningún valor) o `"incorrect"` (se extrajo un valor, pero no coincide con el esperado) — categorías honestas: sin datos reales no se puede afirmar más detalle (ej. "wrong format" específico). */
  error: "missing" | "incorrect";
  frequency: number;
}

export interface ExtractionMetrics {
  totalDocumentsProcessed: number;
  fieldsExtracted: FieldMetrics[];
  overallAccuracy: number;
  overallF1: number;
  commonErrors: CommonError[];
}

const FIELD_NAMES: FieldName[] = ["proveedor", "nit", "fecha", "iva", "valor", "total"];
const NUMERIC_FIELDS = new Set<FieldName>(["iva", "valor", "total"]);
/** Tolerancia para comparar montos — evita falsos "incorrecto" por representación de punto flotante (ej. `0.1+0.2 !== 0.3`) en valores con 2 decimales. */
const NUMERIC_EPSILON = 0.005;

function valuesMatch(field: FieldName, actual: string | number | null, expected: string | number): boolean {
  if (actual === null) return false;
  if (NUMERIC_FIELDS.has(field)) {
    return Math.abs(Number(actual) - Number(expected)) < NUMERIC_EPSILON;
  }
  return String(actual) === String(expected);
}

interface FieldAccumulator {
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  correct: number;
  confidences: number[];
}

function emptyAccumulator(): FieldAccumulator {
  return { truePositives: 0, falsePositives: 0, falseNegatives: 0, correct: 0, confidences: [] };
}

/**
 * El cálculo real de métricas, separado de `evaluateFieldExtraction` para
 * poder testearlo con `ExtractedFields`/`ExpectedFields` construidos
 * directamente — no requiere renderizar imágenes de factura reconocibles
 * (que necesitarían un alfabeto sintético mucho más rico que el usado en
 * los tests de `ocr-pipeline.ts`, Fase 4e, solo para probar la aritmética
 * de precision/recall/F1).
 */
export function computeFieldMetrics(results: Array<{ extracted: ExtractedFields; expected: ExpectedFields }>): ExtractionMetrics {
  const accumulators = new Map<FieldName, FieldAccumulator>(FIELD_NAMES.map((field) => [field, emptyAccumulator()]));
  const errorCounts = new Map<string, number>();

  for (const { extracted, expected } of results) {
    for (const field of FIELD_NAMES) {
      const acc = accumulators.get(field)!;
      const extractedField = extracted[field];
      const expectedValue = expected[field];
      const matches = valuesMatch(field, extractedField.value, expectedValue);

      acc.confidences.push(extractedField.confidence);

      if (matches) {
        acc.correct++;
        acc.truePositives++;
      } else if (extractedField.value === null) {
        acc.falseNegatives++;
        const key = `${field}|missing`;
        errorCounts.set(key, (errorCounts.get(key) ?? 0) + 1);
      } else {
        acc.falsePositives++;
        const key = `${field}|incorrect`;
        errorCounts.set(key, (errorCounts.get(key) ?? 0) + 1);
      }
    }
  }

  const totalDocumentsProcessed = results.length;

  const fieldsExtracted: FieldMetrics[] = FIELD_NAMES.map((field) => {
    const acc = accumulators.get(field)!;
    const { truePositives, falsePositives, falseNegatives, correct, confidences } = acc;

    const precision = truePositives + falsePositives > 0 ? truePositives / (truePositives + falsePositives) : 1;
    const recall = truePositives + falseNegatives > 0 ? truePositives / (truePositives + falseNegatives) : 1;
    const f1Score = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

    return {
      field,
      accuracy: totalDocumentsProcessed > 0 ? correct / totalDocumentsProcessed : 0,
      precision,
      recall,
      f1Score,
      confidence: confidences.length > 0 ? confidences.reduce((sum, c) => sum + c, 0) / confidences.length : 0,
      examplesCorrect: correct,
      examplesIncorrect: totalDocumentsProcessed - correct,
    };
  });

  const commonErrors: CommonError[] = Array.from(errorCounts.entries())
    .map(([key, frequency]) => {
      const [field, error] = key.split("|") as [FieldName, "missing" | "incorrect"];
      return { field, error, frequency };
    })
    .sort((a, b) => b.frequency - a.frequency);

  return {
    totalDocumentsProcessed,
    fieldsExtracted,
    overallAccuracy: average(fieldsExtracted.map((f) => f.accuracy)),
    overallF1: average(fieldsExtracted.map((f) => f.f1Score)),
    commonErrors,
  };
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Corre el pipeline completo (Fase 4e) + extracción sobre cada documento
 * de test y compara contra `expectedFields` — la evaluación end-to-end
 * real de RF-003. `imageData` en vez de `File` (como pedía originalmente
 * esta fase): `decodeImage` requiere Canvas real de navegador, no
 * ejecutable en esta sesión (mismo límite de Fase 4a/4d/4e).
 */
export function evaluateFieldExtraction(testDocuments: FieldTestDocument[], classifier: CharacterClassifier): ExtractionMetrics {
  const results = testDocuments.map((doc) => {
    const ocrResult = runOCRPipelineOnImageData(doc.imageData, classifier);
    const extracted = extractFields(ocrResult);
    return { extracted, expected: doc.expectedFields };
  });
  return computeFieldMetrics(results);
}
