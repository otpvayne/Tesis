import { describe, expect, it } from "vitest";
import { generateEvaluationReport } from "@/modules/ocr/evaluation/generate-report";
import type { CharacterMetrics } from "@/modules/ocr/evaluation/character-metrics";
import type { ExtractionMetrics } from "@/modules/ocr/evaluation/field-extraction-metrics";
import type { PerformanceBenchmark } from "@/modules/ocr/evaluation/performance-benchmark";
import type { ReproducibilityResult } from "@/modules/ocr/evaluation/reproducibility-test";

const characterMetrics: CharacterMetrics = {
  totalCharactersProcessed: 10,
  correctCharacters: 8,
  accuracy: 0.8,
  perClassAccuracy: { "1": 1, "7": 0.6 },
  labels: ["1", "7"],
  confusionMatrix: [
    [5, 0],
    [2, 3],
  ],
  commonMisclassifications: [{ actual: "7", predicted: "1", count: 2 }],
};

const extractionMetrics: ExtractionMetrics = {
  totalDocumentsProcessed: 3,
  fieldsExtracted: [
    { field: "proveedor", accuracy: 1, precision: 1, recall: 1, f1Score: 1, confidence: 0.9, examplesCorrect: 3, examplesIncorrect: 0 },
    { field: "nit", accuracy: 1 / 3, precision: 0.5, recall: 0.5, f1Score: 0.5, confidence: 0.55, examplesCorrect: 1, examplesIncorrect: 2 },
    { field: "fecha", accuracy: 1, precision: 1, recall: 1, f1Score: 1, confidence: 0.9, examplesCorrect: 3, examplesIncorrect: 0 },
    { field: "iva", accuracy: 0, precision: 1, recall: 0, f1Score: 0, confidence: 0, examplesCorrect: 0, examplesIncorrect: 3 },
    { field: "valor", accuracy: 1, precision: 1, recall: 1, f1Score: 1, confidence: 0.9, examplesCorrect: 3, examplesIncorrect: 0 },
    { field: "total", accuracy: 1, precision: 1, recall: 1, f1Score: 1, confidence: 0.9, examplesCorrect: 3, examplesIncorrect: 0 },
  ],
  overallAccuracy: 13 / 18,
  overallF1: 4.5 / 6,
  commonErrors: [
    { field: "iva", error: "missing", frequency: 3 },
    { field: "nit", error: "missing", frequency: 1 },
    { field: "nit", error: "incorrect", frequency: 1 },
  ],
};

const benchmark: PerformanceBenchmark = {
  documentsProcessed: 4,
  totalTimeMs: 655,
  averageTimePerDocument: 163.75,
  timeBreakdown: { preprocess: 11.25, segmentation: 21.25, recognition: 125, extraction: 6.25, total: 163.75 },
  percentile95: 250,
  percentile99: 250,
  throughput: 1000 / 163.75,
  bottleneck: "recognition",
};

const reproducibility: ReproducibilityResult = {
  sameImage: true,
  sameOCRText: true,
  sameExtractedFields: true,
  confidence: 1,
  variance: { characterConfidence: 0, fieldValues: 0 },
};

describe("generateEvaluationReport", () => {
  it("incluye los números reales pasados en input, sin inventar ninguno", () => {
    const report = generateEvaluationReport({
      characterMetrics,
      extractionMetrics,
      benchmark,
      reproducibility,
      datasetLabel: "datos sintéticos de prueba",
      generatedAt: new Date("2026-08-12T00:00:00Z"),
    });

    expect(report).toContain("datos sintéticos de prueba");
    expect(report).toContain("2026-08-12");
    expect(report).toContain("80.0%"); // character accuracy
    expect(report).toContain("7 → 1 : 2 veces");
    expect(report).toContain("163.8 ms"); // average time per document (1 decimal)
    expect(report).toContain("← BOTTLENECK");
    expect(report).toContain("recognition");
    expect(report).toContain("100.0%"); // reproducibility confidence
    // no debe contener ninguno de los numeros de ejemplo del prompt original (87.3%, 2847ms, etc.)
    expect(report).not.toContain("87.3%");
    expect(report).not.toContain("2847");
  });

  it("el resumen marca ✅/❌ según los targets declarados, no siempre ✅", () => {
    const failingBenchmark: PerformanceBenchmark = { ...benchmark, averageTimePerDocument: 6000, percentile99: 6500 };
    const report = generateEvaluationReport({
      characterMetrics,
      extractionMetrics,
      benchmark: failingBenchmark,
      reproducibility,
      datasetLabel: "test",
    });
    expect(report).toContain("❌ Performance");
  });

  it("con métricas vacías no revienta", () => {
    const empty: ExtractionMetrics = { totalDocumentsProcessed: 0, fieldsExtracted: [], overallAccuracy: 0, overallF1: 0, commonErrors: [] };
    const emptyCharacters: CharacterMetrics = {
      totalCharactersProcessed: 0,
      correctCharacters: 0,
      accuracy: 0,
      perClassAccuracy: {},
      labels: [],
      confusionMatrix: [],
      commonMisclassifications: [],
    };
    const emptyBenchmark: PerformanceBenchmark = {
      documentsProcessed: 0,
      totalTimeMs: 0,
      averageTimePerDocument: 0,
      timeBreakdown: { preprocess: 0, segmentation: 0, recognition: 0, extraction: 0, total: 0 },
      percentile95: 0,
      percentile99: 0,
      throughput: 0,
      bottleneck: "recognition",
    };
    expect(() =>
      generateEvaluationReport({
        characterMetrics: emptyCharacters,
        extractionMetrics: empty,
        benchmark: emptyBenchmark,
        reproducibility,
        datasetLabel: "vacío",
      }),
    ).not.toThrow();
  });
});
