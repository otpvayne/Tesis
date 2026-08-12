import { describe, expect, it } from "vitest";
import {
  benchmarkPerformanceOnImageData,
  computeBenchmarkFromTimings,
  type TimeBreakdown,
} from "@/modules/ocr/evaluation/performance-benchmark";
import { CharacterClassifier } from "@/modules/ocr/classification/character-classifier";
import { createImageData } from "@/modules/ocr/preprocessing/create-image-data";

describe("computeBenchmarkFromTimings", () => {
  it("caso a mano: 4 documentos con tiempos conocidos -> promedio, percentiles y cuello de botella exactos", () => {
    const timings: TimeBreakdown[] = [
      { preprocess: 10, segmentation: 20, recognition: 100, extraction: 5, total: 135 },
      { preprocess: 12, segmentation: 22, recognition: 110, extraction: 6, total: 150 },
      { preprocess: 8, segmentation: 18, recognition: 90, extraction: 4, total: 120 },
      { preprocess: 15, segmentation: 25, recognition: 200, extraction: 10, total: 250 },
    ];

    const result = computeBenchmarkFromTimings(timings);

    expect(result.documentsProcessed).toBe(4);
    expect(result.totalTimeMs).toBe(655); // 135+150+120+250
    expect(result.averageTimePerDocument).toBeCloseTo(163.75, 10); // 655/4

    expect(result.timeBreakdown.preprocess).toBeCloseTo(11.25, 10); // (10+12+8+15)/4
    expect(result.timeBreakdown.segmentation).toBeCloseTo(21.25, 10); // (20+22+18+25)/4
    expect(result.timeBreakdown.recognition).toBeCloseTo(125, 10); // (100+110+90+200)/4
    expect(result.timeBreakdown.extraction).toBeCloseTo(6.25, 10); // (5+6+4+10)/4

    expect(result.bottleneck).toBe("recognition");

    // ordenado: [120,135,150,250] -- N=4, p95: ceil(0.95*4)-1=3 -> 250; p99 igual
    expect(result.percentile95).toBe(250);
    expect(result.percentile99).toBe(250);

    expect(result.throughput).toBeCloseTo(1000 / 163.75, 10);
  });

  it("con documentos vacíos, todo en 0 sin reventar (bottleneck por defecto 'recognition')", () => {
    const result = computeBenchmarkFromTimings([]);
    expect(result.documentsProcessed).toBe(0);
    expect(result.averageTimePerDocument).toBe(0);
    expect(result.percentile95).toBe(0);
    expect(result.throughput).toBe(0);
  });

  it("percentiles con N=1: el único documento es tanto p95 como p99", () => {
    const result = computeBenchmarkFromTimings([
      { preprocess: 1, segmentation: 1, recognition: 1, extraction: 1, total: 4 },
    ]);
    expect(result.percentile95).toBe(4);
    expect(result.percentile99).toBe(4);
  });
});

describe("benchmarkPerformanceOnImageData (integración con el pipeline real)", () => {
  it("mide tiempos reales sobre imágenes sintéticas y produce una estructura bien formada", () => {
    const SIZE = 32;
    const blankData = new Uint8ClampedArray(SIZE * SIZE * 4);
    for (let i = 0; i < SIZE * SIZE; i++) blankData[i * 4 + 3] = 255;
    const classifier = new CharacterClassifier();
    classifier.train([
      { imageData: createImageData(blankData, SIZE, SIZE), label: "1" },
      { imageData: createImageData(blankData, SIZE, SIZE), label: "7" },
    ]);

    const invoiceData = new Uint8ClampedArray(64 * 64 * 4);
    for (let i = 0; i < 64 * 64; i++) {
      invoiceData[i * 4] = invoiceData[i * 4 + 1] = invoiceData[i * 4 + 2] = 230;
      invoiceData[i * 4 + 3] = 255;
    }
    const invoice = createImageData(invoiceData, 64, 64);

    const result = benchmarkPerformanceOnImageData([invoice, invoice, invoice], classifier, 2);

    expect(result.documentsProcessed).toBe(3);
    expect(result.timeBreakdown.preprocess).toBeGreaterThanOrEqual(0);
    expect(result.averageTimePerDocument).toBeGreaterThanOrEqual(0);
    expect(["preprocess", "segmentation", "recognition", "extraction"]).toContain(result.bottleneck);
  });

  it("lanza si no hay documentos o iterations < 1", () => {
    const classifier = new CharacterClassifier();
    classifier.train([{ imageData: createImageData(new Uint8ClampedArray(32 * 32 * 4), 32, 32), label: "1" }]);
    expect(() => benchmarkPerformanceOnImageData([], classifier)).toThrow();
    const img = createImageData(new Uint8ClampedArray(32 * 32 * 4), 32, 32);
    expect(() => benchmarkPerformanceOnImageData([img], classifier, 0)).toThrow();
  });
});
