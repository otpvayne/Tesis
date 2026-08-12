import { describe, expect, it } from "vitest";
import { computeFieldMetrics, evaluateFieldExtraction, type ExpectedFields } from "@/modules/ocr/evaluation/field-extraction-metrics";
import type { ExtractedFields } from "@/modules/ocr/classification/field-extraction";
import { CharacterClassifier } from "@/modules/ocr/classification/character-classifier";
import { createImageData } from "@/modules/ocr/preprocessing/create-image-data";

function field<T>(value: T | null, confidence: number): { value: T | null; confidence: number; sourceRegion: null } {
  return { value, confidence, sourceRegion: null };
}

const EXPECTED: ExpectedFields = {
  proveedor: "Acme SAS",
  nit: "900123456",
  fecha: "12/08/2025",
  iva: 234.56,
  valor: 1234.56,
  total: 1468.12,
};

function extractedAllCorrect(): ExtractedFields {
  return {
    proveedor: field(EXPECTED.proveedor, 0.9),
    nit: field(EXPECTED.nit, 0.9),
    fecha: field(EXPECTED.fecha, 0.9),
    iva: field(EXPECTED.iva, 0.9),
    valor: field(EXPECTED.valor, 0.9),
    total: field(EXPECTED.total, 0.9),
    rawOCR: "",
    extractionMethod: "pattern",
  };
}

describe("computeFieldMetrics", () => {
  it("caso a mano: nit con 1 acierto / 1 faltante / 1 incorrecto; iva siempre faltante; el resto siempre correcto", () => {
    const doc1: ExtractedFields = { ...extractedAllCorrect(), iva: field(null, 0) };
    const doc2: ExtractedFields = { ...extractedAllCorrect(), nit: field(null, 0), iva: field(null, 0) };
    const doc3: ExtractedFields = { ...extractedAllCorrect(), nit: field("900999999", 0.7), iva: field(null, 0) };

    const metrics = computeFieldMetrics([
      { extracted: doc1, expected: EXPECTED },
      { extracted: doc2, expected: EXPECTED },
      { extracted: doc3, expected: EXPECTED },
    ]);

    expect(metrics.totalDocumentsProcessed).toBe(3);

    const byField = Object.fromEntries(metrics.fieldsExtracted.map((f) => [f.field, f]));

    // nit: TP=1 (doc1), FN=1 (doc2, null), FP=1 (doc3, valor incorrecto)
    // precision = 1/(1+1) = 0.5, recall = 1/(1+1) = 0.5, f1 = 0.5
    expect(byField.nit.accuracy).toBeCloseTo(1 / 3, 10);
    expect(byField.nit.precision).toBeCloseTo(0.5, 10);
    expect(byField.nit.recall).toBeCloseTo(0.5, 10);
    expect(byField.nit.f1Score).toBeCloseTo(0.5, 10);
    expect(byField.nit.confidence).toBeCloseTo((0.9 + 0 + 0.7) / 3, 10);
    expect(byField.nit.examplesCorrect).toBe(1);
    expect(byField.nit.examplesIncorrect).toBe(2);

    // iva: siempre null -> TP=0, FP=0, FN=3 -> precision=1 (sin FP), recall=0, f1=0
    expect(byField.iva.accuracy).toBe(0);
    expect(byField.iva.precision).toBe(1);
    expect(byField.iva.recall).toBe(0);
    expect(byField.iva.f1Score).toBe(0);

    // total: siempre correcto -> TP=3, precision=recall=f1=1, accuracy=1
    expect(byField.total.accuracy).toBe(1);
    expect(byField.total.precision).toBe(1);
    expect(byField.total.recall).toBe(1);
    expect(byField.total.f1Score).toBe(1);

    // overallAccuracy = promedio de las 6 accuracies = (1 + 1/3 + 1 + 0 + 1 + 1) / 6
    expect(metrics.overallAccuracy).toBeCloseTo((1 + 1 / 3 + 1 + 0 + 1 + 1) / 6, 10);
    // overallF1 = promedio de los 6 f1: proveedor=1, nit=0.5, fecha=1, iva=0, valor=1, total=1
    expect(metrics.overallF1).toBeCloseTo((1 + 0.5 + 1 + 0 + 1 + 1) / 6, 10);

    expect(metrics.commonErrors).toEqual([
      { field: "iva", error: "missing", frequency: 3 },
      { field: "nit", error: "missing", frequency: 1 },
      { field: "nit", error: "incorrect", frequency: 1 },
    ]);
  });

  it("tolerancia numérica: iva=234.555 vs esperado 234.56 (diferencia < epsilon) cuenta como correcto", () => {
    const doc: ExtractedFields = { ...extractedAllCorrect(), iva: field(234.555, 0.9) };
    const metrics = computeFieldMetrics([{ extracted: doc, expected: EXPECTED }]);
    const iva = metrics.fieldsExtracted.find((f) => f.field === "iva")!;
    expect(iva.accuracy).toBe(1);
  });

  it("sin documentos: todo en 0, sin dividir por cero", () => {
    const metrics = computeFieldMetrics([]);
    expect(metrics.totalDocumentsProcessed).toBe(0);
    expect(metrics.overallAccuracy).toBe(0);
    for (const f of metrics.fieldsExtracted) {
      expect(f.accuracy).toBe(0);
    }
  });
});

describe("evaluateFieldExtraction (integración con el pipeline real)", () => {
  it("corre el pipeline completo sobre ImageData y produce una estructura de métricas bien formada (smoke test — el alfabeto sintético de 2 formas no alcanza a deletrear campos reales, ver nota)", () => {
    // No se re-construye aquí un alfabeto sintético completo (0-9/A-Z) solo
    // para deletrear "NIT 123456789" de forma reconocible -- eso ya se
    // cubre indirectamente por extractFields (Fase 4e, probado a fondo con
    // OCRResult construido directo) y por computeFieldMetrics (arriba).
    // Este test solo verifica que evaluateFieldExtraction conecta
    // pipeline -> extractFields -> computeFieldMetrics sin romperse.
    const SIZE = 32;
    const data = new Uint8ClampedArray(SIZE * SIZE * 4);
    for (let i = 0; i < SIZE * SIZE; i++) data[i * 4 + 3] = 255;
    const blankChar = createImageData(data, SIZE, SIZE);

    const classifier = new CharacterClassifier();
    classifier.train([
      { imageData: blankChar, label: "1" },
      { imageData: blankChar, label: "7" },
    ]);

    const blankInvoice = new Uint8ClampedArray(64 * 64 * 4);
    for (let i = 0; i < 64 * 64; i++) {
      blankInvoice[i * 4] = blankInvoice[i * 4 + 1] = blankInvoice[i * 4 + 2] = 230;
      blankInvoice[i * 4 + 3] = 255;
    }

    const metrics = evaluateFieldExtraction(
      [{ imageData: createImageData(blankInvoice, 64, 64), expectedFields: EXPECTED }],
      classifier,
    );

    expect(metrics.totalDocumentsProcessed).toBe(1);
    expect(metrics.fieldsExtracted).toHaveLength(6);
    // imagen en blanco -> sin texto -> todos los campos ausentes (null) -> accuracy 0
    expect(metrics.overallAccuracy).toBe(0);
  });
});
