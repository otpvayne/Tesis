import { describe, expect, it } from "vitest";
import { Dataset, type TrainingSample } from "@/modules/ocr/classification/dataset";
import { createImageData } from "@/modules/ocr/preprocessing/create-image-data";

function fakeImageData(): ImageData {
  return createImageData(new Uint8ClampedArray(4 * 4 * 4), 4, 4);
}

function sample(label: string, index: number): TrainingSample {
  return {
    characterImageData: fakeImageData(),
    label,
    sourceDocument: `factura-${index}.jpg`,
    confidence: 1,
  };
}

describe("Dataset", () => {
  it("labelCounts cuenta las muestras por label", () => {
    const samples = [sample("A", 0), sample("A", 1), sample("B", 2), sample("A", 3)];
    const dataset = new Dataset(samples);
    expect(dataset.labelCounts).toEqual({ A: 3, B: 1 });
  });

  it("split estratificado: cada label se divide por separado según trainRatio", () => {
    // label A: 10 muestras, trainRatio=0.8 -> round(8)=8 train, 2 test
    // label B: 4 muestras,  trainRatio=0.8 -> round(3.2)=3 train, 1 test
    const samplesA = Array.from({ length: 10 }, (_, i) => sample("A", i));
    const samplesB = Array.from({ length: 4 }, (_, i) => sample("B", i));
    const dataset = new Dataset([...samplesA, ...samplesB]);

    const { train, test } = dataset.split(0.8);

    expect(train.labelCounts).toEqual({ A: 8, B: 3 });
    expect(test.labelCounts).toEqual({ A: 2, B: 1 });
  });

  it("train + test no se solapan y juntos reconstruyen el dataset original", () => {
    const samples = Array.from({ length: 10 }, (_, i) => sample(i % 2 === 0 ? "A" : "B", i));
    const dataset = new Dataset(samples);
    const { train, test } = dataset.split(0.7);

    expect(train.samples.length + test.samples.length).toBe(samples.length);

    const trainDocs = new Set(train.samples.map((s) => s.sourceDocument));
    const testDocs = new Set(test.samples.map((s) => s.sourceDocument));
    for (const doc of trainDocs) expect(testDocs.has(doc)).toBe(false);
  });

  it("preserva el orden de llegada dentro de cada label (determinista, sin mezcla)", () => {
    const samples = [sample("A", 0), sample("A", 1), sample("A", 2), sample("A", 3)];
    const dataset = new Dataset(samples);
    const { train, test } = dataset.split(0.5);

    expect(train.samples.map((s) => s.sourceDocument)).toEqual(["factura-0.jpg", "factura-1.jpg"]);
    expect(test.samples.map((s) => s.sourceDocument)).toEqual(["factura-2.jpg", "factura-3.jpg"]);
  });

  it("lanza si trainRatio está fuera de (0, 1)", () => {
    const dataset = new Dataset([sample("A", 0)]);
    expect(() => dataset.split(0)).toThrow();
    expect(() => dataset.split(1)).toThrow();
    expect(() => dataset.split(-0.1)).toThrow();
    expect(() => dataset.split(1.5)).toThrow();
  });

  it("dataset vacío tiene labelCounts vacío y split no revienta", () => {
    const dataset = new Dataset([]);
    expect(dataset.labelCounts).toEqual({});
    const { train, test } = dataset.split(0.8);
    expect(train.samples).toHaveLength(0);
    expect(test.samples).toHaveLength(0);
  });
});
