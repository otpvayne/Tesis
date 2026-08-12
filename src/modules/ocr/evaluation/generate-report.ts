import type { CharacterMetrics } from "@/modules/ocr/evaluation/character-metrics";
import type { ExtractionMetrics } from "@/modules/ocr/evaluation/field-extraction-metrics";
import type { PerformanceBenchmark } from "@/modules/ocr/evaluation/performance-benchmark";
import type { ReproducibilityResult } from "@/modules/ocr/evaluation/reproducibility-test";

export interface EvaluationReportInput {
  characterMetrics: CharacterMetrics;
  extractionMetrics: ExtractionMetrics;
  benchmark: PerformanceBenchmark;
  reproducibility: ReproducibilityResult;
  /**
   * De dónde salen los datos evaluados — nunca se asume ni se omite. Ej.
   * `"datos sintéticos (formas conocidas, Fase 4f)"` o
   * `"facturas reales de Mansor, partición test, n=12"`. Un reporte sin
   * esto sería exactamente el tipo de cifra "sin origen claro" que
   * `docs/ocr/evaluation.md` §1 prohíbe.
   */
  datasetLabel: string;
  generatedAt?: Date;
}

/** Objetivos declarados en `docs/ocr/evaluation.md`/`CLAUDE.md` §8 — se usan aquí solo como umbral de comparación para el resumen, no como afirmación de que se cumplen. */
const TARGETS = {
  characterAccuracy: 0.85,
  fieldAccuracy: 0.8,
  performanceMs: 5000,
  reproducibility: 1,
};

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function statusIcon(pass: boolean): string {
  return pass ? "✅" : "❌";
}

function section(title: string): string {
  const bar = "─".repeat(65);
  return `${title}\n${bar}`;
}

function formatCharacterSection(metrics: CharacterMetrics): string {
  const lines: string[] = [section("1. CHARACTER RECOGNITION")];
  lines.push(`   Overall Accuracy: ${pct(metrics.accuracy)} (${metrics.correctCharacters}/${metrics.totalCharactersProcessed})`);
  lines.push("");
  lines.push("   Per-Class Accuracy:");
  if (metrics.labels.length === 0) {
    lines.push("     (sin muestras de test)");
  } else {
    for (const label of metrics.labels) {
      lines.push(`     '${label}': ${pct(metrics.perClassAccuracy[label] ?? 0)}`);
    }
  }
  lines.push("");
  lines.push("   Common Misclassifications:");
  if (metrics.commonMisclassifications.length === 0) {
    lines.push("     (ninguna)");
  } else {
    for (const m of metrics.commonMisclassifications) {
      lines.push(`     ${m.actual} → ${m.predicted} : ${m.count} veces`);
    }
  }
  return lines.join("\n");
}

function formatExtractionSection(metrics: ExtractionMetrics): string {
  const lines: string[] = [section("2. FIELD EXTRACTION")];
  lines.push(`   Overall Accuracy: ${pct(metrics.overallAccuracy)} — Overall F1: ${metrics.overallF1.toFixed(3)}`);
  lines.push(`   Documents Processed: ${metrics.totalDocumentsProcessed}`);
  lines.push("");
  lines.push("   Per-Field Metrics:");
  for (const field of metrics.fieldsExtracted) {
    lines.push(
      `     ${field.field.padEnd(10)} accuracy=${pct(field.accuracy)}  precision=${field.precision.toFixed(2)}  recall=${field.recall.toFixed(2)}  f1=${field.f1Score.toFixed(2)}  confidence=${field.confidence.toFixed(2)}`,
    );
  }
  lines.push("");
  lines.push("   Common Extraction Errors:");
  if (metrics.commonErrors.length === 0) {
    lines.push("     (ninguno)");
  } else {
    for (const err of metrics.commonErrors.slice(0, 10)) {
      lines.push(`     ${err.field}: ${err.error} (${err.frequency} veces)`);
    }
  }
  return lines.join("\n");
}

function formatBenchmarkSection(benchmark: PerformanceBenchmark): string {
  const lines: string[] = [section("3. PERFORMANCE BENCHMARK")];
  lines.push(`   Documents Processed: ${benchmark.documentsProcessed}`);
  const passesAverage = benchmark.averageTimePerDocument < TARGETS.performanceMs;
  lines.push(
    `   Average Time: ${benchmark.averageTimePerDocument.toFixed(1)} ms ${statusIcon(passesAverage)} (objetivo RNF-001: <${TARGETS.performanceMs} ms)`,
  );
  lines.push("");
  lines.push("   Time Breakdown:");
  const total = benchmark.timeBreakdown.total || 1;
  for (const stage of ["preprocess", "segmentation", "recognition", "extraction"] as const) {
    const value = benchmark.timeBreakdown[stage];
    const isBottleneck = stage === benchmark.bottleneck;
    lines.push(
      `     ${stage.padEnd(13)} ${value.toFixed(1)} ms (${((value / total) * 100).toFixed(1)}%)${isBottleneck ? " ← BOTTLENECK" : ""}`,
    );
  }
  lines.push("");
  const passesP99 = benchmark.percentile99 < TARGETS.performanceMs;
  lines.push("   Percentiles:");
  lines.push(`     P95: ${benchmark.percentile95.toFixed(1)} ms`);
  lines.push(`     P99: ${benchmark.percentile99.toFixed(1)} ms ${statusIcon(passesP99)} (<${TARGETS.performanceMs} ms)`);
  lines.push("");
  lines.push(`   Throughput: ${benchmark.throughput.toFixed(2)} docs/second`);
  return lines.join("\n");
}

function formatReproducibilitySection(reproducibility: ReproducibilityResult): string {
  const lines: string[] = [section("4. REPRODUCIBILITY")];
  lines.push(`   Same OCR Text: ${statusIcon(reproducibility.sameOCRText)} ${reproducibility.sameOCRText}`);
  lines.push(`   Same Extracted Fields: ${statusIcon(reproducibility.sameExtractedFields)} ${reproducibility.sameExtractedFields}`);
  lines.push(`   Reproducibility Score: ${pct(reproducibility.confidence)}`);
  lines.push(
    `   Variance: characterConfidence=${reproducibility.variance.characterConfidence.toFixed(6)}, fieldValues=${reproducibility.variance.fieldValues.toFixed(6)}`,
  );
  return lines.join("\n");
}

function buildRecommendations(input: EvaluationReportInput): string[] {
  const recommendations: string[] = [];

  const worstMisclass = input.characterMetrics.commonMisclassifications[0];
  if (worstMisclass) {
    recommendations.push(
      `Reconocimiento de caracteres: la confusión más frecuente es '${worstMisclass.actual}' → '${worstMisclass.predicted}' (${worstMisclass.count} veces). Revisar con más muestras reales etiquetadas de esos dos caracteres.`,
    );
  }

  const worstField = [...input.extractionMetrics.fieldsExtracted].sort((a, b) => a.accuracy - b.accuracy)[0];
  if (worstField && input.extractionMetrics.totalDocumentsProcessed > 0) {
    recommendations.push(
      `Extracción de campos: '${worstField.field}' tiene la accuracy más baja (${pct(worstField.accuracy)}). Revisar patrones/keywords en \`field-extraction.ts\` para ese campo específico.`,
    );
  }

  if (input.benchmark.documentsProcessed > 0) {
    recommendations.push(
      `Performance: el cuello de botella medido es '${input.benchmark.bottleneck}' (${input.benchmark.timeBreakdown[input.benchmark.bottleneck].toFixed(1)} ms promedio). Si es 'recognition', considerar optimizar la búsqueda de vecinos de \`KNNClassifier\` (escaneo lineal O(N·D), ya señalado como riesgo desde Fase 4c).`,
    );
  }

  if (!input.reproducibility.sameOCRText || !input.reproducibility.sameExtractedFields) {
    recommendations.push(
      "Reproducibilidad: se detectó variación entre corridas de la misma imagen — investigar antes de continuar, el pipeline no debería tener ninguna fuente de aleatoriedad en el camino de reconocimiento.",
    );
  }

  recommendations.push("Siguiente paso: Andrés y Santiago etiquetando facturas reales (OCR LAB) para fine-tuning del modelo (Fase 4d/5+).");

  return recommendations;
}

/**
 * Formatea 4 objetos de métricas ya calculados a un reporte de texto —
 * **no calcula nada aquí**, solo presenta. Ningún número en este reporte
 * es inventado: todos vienen de `input`, calculado por quien llama
 * (`character-metrics.ts`, `field-extraction-metrics.ts`,
 * `performance-benchmark.ts`, `reproducibility-test.ts`) sobre datos
 * reales o sintéticos — `datasetLabel` dice cuál de las dos, siempre.
 */
export function generateEvaluationReport(input: EvaluationReportInput): string {
  const generatedAt = input.generatedAt ?? new Date();
  const bar = "═".repeat(65);

  const characterPass = input.characterMetrics.accuracy >= TARGETS.characterAccuracy;
  const extractionPass = input.extractionMetrics.overallAccuracy >= TARGETS.fieldAccuracy;
  const performancePass = input.benchmark.averageTimePerDocument < TARGETS.performanceMs;
  const reproducibilityPass = input.reproducibility.confidence >= TARGETS.reproducibility;

  const lines: string[] = [
    bar,
    "OCR EVALUATION REPORT — Fase 4f",
    `Dataset: ${input.datasetLabel}`,
    `Fecha: ${generatedAt.toISOString().slice(0, 10)}`,
    bar,
    "",
    formatCharacterSection(input.characterMetrics),
    "",
    formatExtractionSection(input.extractionMetrics),
    "",
    formatBenchmarkSection(input.benchmark),
    "",
    formatReproducibilitySection(input.reproducibility),
    "",
    bar,
    "SUMMARY",
    "─".repeat(65),
    `${statusIcon(characterPass)} Character Recognition: ${pct(input.characterMetrics.accuracy)} (target: >${pct(TARGETS.characterAccuracy)})`,
    `${statusIcon(extractionPass)} Field Extraction: ${pct(input.extractionMetrics.overallAccuracy)} (target: >${pct(TARGETS.fieldAccuracy)})`,
    `${statusIcon(performancePass)} Performance: ${input.benchmark.averageTimePerDocument.toFixed(1)}ms avg (target: <${TARGETS.performanceMs}ms)`,
    `${statusIcon(reproducibilityPass)} Reproducibility: ${pct(input.reproducibility.confidence)} (target: ${pct(TARGETS.reproducibility)})`,
    "",
    "RECOMMENDATIONS:",
    ...buildRecommendations(input).map((r, i) => `${i + 1}. ${r}`),
    "",
    bar,
  ];

  return lines.join("\n");
}
