import { describe, expect, it } from "vitest";
import { denoise } from "@/modules/ocr/preprocessing/denoise";
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

describe("denoise", () => {
  it("limpia un píxel blanco aislado en el centro de un fondo negro 3×3", () => {
    // prettier-ignore
    const values = [
      0, 0, 0,
      0, 255, 0,
      0, 0, 0,
    ];
    const input = createImageData(grayPixels(values), 3, 3);
    const result = denoise(input, 3);
    // centro (índice 4): vecindad 3x3 completa = 8 ceros + 1 blanco ->
    // mediana (5to valor de 9 ordenados) = 0
    expect(result.data[4 * 4]).toBe(0);
  });

  it("limpia un píxel negro aislado en el centro de un fondo blanco 3×3 (caso simétrico)", () => {
    // prettier-ignore
    const values = [
      255, 255, 255,
      255, 0, 255,
      255, 255, 255,
    ];
    const input = createImageData(grayPixels(values), 3, 3);
    const result = denoise(input, 3);
    expect(result.data[4 * 4]).toBe(255);
  });

  it("preserva una región mayoritariamente blanca (no borra todo, solo el ruido aislado)", () => {
    // prettier-ignore
    const values = [
      255, 255, 255,
      255, 255, 255,
      255, 255, 0, // una sola esquina con ruido negro
    ];
    const input = createImageData(grayPixels(values), 3, 3);
    const result = denoise(input, 3);
    // centro: 8 vecinos blancos + 1 negro -> mediana sigue siendo blanca
    expect(result.data[4 * 4]).toBe(255);
  });

  it("usa replicación de borde: un píxel de ruido en la esquina también se limpia", () => {
    // prettier-ignore
    const values = [
      255, 0, 0,
      0, 0, 0,
      0, 0, 0,
    ];
    const input = createImageData(grayPixels(values), 3, 3);
    const result = denoise(input, 3);
    // esquina (0,0): con replicación de borde, la vecindad efectiva es
    // [255,255,0, 255,255,0, 0,0,0] (9 valores) -> ordenado:
    // [0,0,0,0,0,255,255,255,] mediana (5to de 9) = 0
    expect(result.data[0]).toBe(0);
  });

  it("preserva el canal alfa", () => {
    const values = [0, 0, 0, 0, 255, 0, 0, 0, 0];
    const data = grayPixels(values);
    data[4 * 4 + 3] = 128; // alfa del centro
    const input = createImageData(data, 3, 3);
    const result = denoise(input, 3);
    expect(result.data[4 * 4 + 3]).toBe(128);
  });

  it("conserva width y height", () => {
    const input = createImageData(new Uint8ClampedArray(5 * 4 * 4), 5, 4);
    const result = denoise(input, 3);
    expect(result.width).toBe(5);
    expect(result.height).toBe(4);
  });

  it("usa kernelSize=3 por defecto", () => {
    const values = [0, 0, 0, 0, 255, 0, 0, 0, 0];
    const input = createImageData(grayPixels(values), 3, 3);
    const withDefault = denoise(input);
    const withExplicit = denoise(input, 3);
    expect(Array.from(withDefault.data)).toEqual(Array.from(withExplicit.data));
  });
});
