import { runOCRPipelineOnImageData } from "@/modules/ocr/pipeline/ocr-pipeline";
import { extractFields } from "@/modules/ocr/classification/field-extraction";
import type { CharacterClassifier } from "@/modules/ocr/classification/character-classifier";

export interface TimeBreakdown {
  preprocess: number;
  segmentation: number;
  recognition: number;
  extraction: number;
  total: number;
}

export type PipelineStage = keyof Omit<TimeBreakdown, "total">;

export interface PerformanceBenchmark {
  documentsProcessed: number;
  totalTimeMs: number;
  averageTimePerDocument: number;
  timeBreakdown: TimeBreakdown;
  percentile95: number;
  percentile99: number;
  /** Documentos por segundo, asumiendo procesamiento en serie (`1000 / averageTimePerDocument`). */
  throughput: number;
  bottleneck: PipelineStage;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Percentil por "nearest rank" sobre un arreglo **ya ordenado**
 * ascendente: `índice = ceil(p/100 · N) - 1`. Ej. `N=4, p=95`:
 * `ceil(0.95·4)-1 = ceil(3.8)-1 = 4-1 = 3` (el último de los 4).
 */
function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil((p / 100) * sortedValues.length) - 1));
  return sortedValues[index];
}

/**
 * El cálculo real (percentiles, promedio, throughput, cuello de botella),
 * separado de `benchmarkPerformanceOnImageData` para poder testearlo con
 * tiempos conocidos de antemano — el tiempo real de `runOCRPipeline` no es
 * predecible a mano (depende de la máquina), pero la aritmética que se le
 * aplica sí lo es.
 */
export function computeBenchmarkFromTimings(perDocumentTimes: TimeBreakdown[]): PerformanceBenchmark {
  if (perDocumentTimes.length === 0) {
    return {
      documentsProcessed: 0,
      totalTimeMs: 0,
      averageTimePerDocument: 0,
      timeBreakdown: { preprocess: 0, segmentation: 0, recognition: 0, extraction: 0, total: 0 },
      percentile95: 0,
      percentile99: 0,
      throughput: 0,
      bottleneck: "recognition",
    };
  }

  const totalTimes = perDocumentTimes.map((d) => d.total).sort((a, b) => a - b);
  const totalTimeMs = totalTimes.reduce((sum, v) => sum + v, 0);
  const averageTimePerDocument = totalTimeMs / perDocumentTimes.length;

  const timeBreakdown: TimeBreakdown = {
    preprocess: average(perDocumentTimes.map((d) => d.preprocess)),
    segmentation: average(perDocumentTimes.map((d) => d.segmentation)),
    recognition: average(perDocumentTimes.map((d) => d.recognition)),
    extraction: average(perDocumentTimes.map((d) => d.extraction)),
    total: averageTimePerDocument,
  };

  const stages: PipelineStage[] = ["preprocess", "segmentation", "recognition", "extraction"];
  let bottleneck = stages[0];
  for (const stage of stages) {
    if (timeBreakdown[stage] > timeBreakdown[bottleneck]) bottleneck = stage;
  }

  return {
    documentsProcessed: perDocumentTimes.length,
    totalTimeMs,
    averageTimePerDocument,
    timeBreakdown,
    percentile95: percentile(totalTimes, 95),
    percentile99: percentile(totalTimes, 99),
    throughput: averageTimePerDocument > 0 ? 1000 / averageTimePerDocument : 0,
    bottleneck,
  };
}

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/**
 * Corre el pipeline completo + extracción sobre cada documento,
 * `iterations` veces cada uno (para promediar ruido de medición por
 * documento — no para juntar todas las corridas en una sola muestra: los
 * percentiles miden variación *entre documentos* distintos, no entre
 * repeticiones del mismo documento).
 */
export function benchmarkPerformanceOnImageData(
  testDocuments: ImageData[],
  classifier: CharacterClassifier,
  iterations: number = 3,
): PerformanceBenchmark {
  if (testDocuments.length === 0) {
    throw new Error("benchmarkPerformanceOnImageData: se necesita al menos un documento de test.");
  }
  if (iterations < 1) {
    throw new Error("benchmarkPerformanceOnImageData: iterations debe ser >= 1.");
  }

  const perDocumentTimes: TimeBreakdown[] = testDocuments.map((imageData) => {
    const runs: TimeBreakdown[] = [];
    for (let i = 0; i < iterations; i++) {
      const ocrResult = runOCRPipelineOnImageData(imageData, classifier);
      const extractionStart = now();
      extractFields(ocrResult);
      const extractionMs = now() - extractionStart;
      runs.push({
        preprocess: ocrResult.timingMs.preprocess,
        segmentation: ocrResult.timingMs.segmentation,
        recognition: ocrResult.timingMs.recognition,
        extraction: extractionMs,
        total: ocrResult.timingMs.total + extractionMs,
      });
    }
    return {
      preprocess: average(runs.map((r) => r.preprocess)),
      segmentation: average(runs.map((r) => r.segmentation)),
      recognition: average(runs.map((r) => r.recognition)),
      extraction: average(runs.map((r) => r.extraction)),
      total: average(runs.map((r) => r.total)),
    };
  });

  return computeBenchmarkFromTimings(perDocumentTimes);
}
