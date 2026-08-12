import { describe, expect, it } from "vitest";
import { computeHistogram } from "@/modules/ocr/preprocessing/histogram";
import { createImageData } from "@/modules/ocr/preprocessing/create-image-data";

function grayPixels(values: number[]): Uint8ClampedArray {
  const out = new Uint8ClampedArray(values.length * 4);
  values.forEach((v, i) => {
    out[i * 4] = v;
    out[i * 4 + 1] = v;
    out[i * 4 + 2] = v;
    out[i * 4 + 3] = 255;
  });
  return out;
}

describe("computeHistogram", () => {
  it("4 píxeles [0, 85, 170, 255]: histograma, media y mediana exactos", () => {
    const input = createImageData(grayPixels([0, 85, 170, 255]), 4, 1);
    const result = computeHistogram(input);

    expect(result.histogram[0]).toBe(1);
    expect(result.histogram[85]).toBe(1);
    expect(result.histogram[170]).toBe(1);
    expect(result.histogram[255]).toBe(1);
    // el resto de los 256 bins deben estar en 0
    expect(result.histogram.reduce((a, b) => a + b, 0)).toBe(4);

    expect(result.mean).toBe(127.5);
    expect(result.median).toBe(127.5);
    // varianza = ((0-127.5)^2+(85-127.5)^2+(170-127.5)^2+(255-127.5)^2)/4 = 9031.25
    expect(result.stddev).toBeCloseTo(Math.sqrt(9031.25), 6);
  });

  it("mediana de un conteo impar de píxeles es el valor central real", () => {
    const input = createImageData(grayPixels([10, 20, 30]), 3, 1);
    expect(computeHistogram(input).median).toBe(20);
  });

  it("mediana de un conteo par de píxeles es el promedio de los dos centrales", () => {
    const input = createImageData(grayPixels([10, 20, 30, 40]), 4, 1);
    // ordenado: [10,20,30,40] -> centrales 20 y 30 -> mediana 25
    expect(computeHistogram(input).median).toBe(25);
  });

  it("imagen uniforme: histograma concentrado en un bin, stddev=0", () => {
    const input = createImageData(grayPixels([128, 128, 128, 128]), 4, 1);
    const result = computeHistogram(input);
    expect(result.histogram[128]).toBe(4);
    expect(result.mean).toBe(128);
    expect(result.median).toBe(128);
    expect(result.stddev).toBe(0);
  });

  it("cuenta múltiples píxeles con el mismo valor en el mismo bin", () => {
    const input = createImageData(grayPixels([50, 50, 200]), 3, 1);
    const result = computeHistogram(input);
    expect(result.histogram[50]).toBe(2);
    expect(result.histogram[200]).toBe(1);
  });
});
