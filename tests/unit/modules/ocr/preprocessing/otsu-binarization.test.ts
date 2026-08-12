import { describe, expect, it } from "vitest";
import {
  computeOtsuThreshold,
  otsuBinarization,
} from "@/modules/ocr/preprocessing/otsu-binarization";
import { createImageData } from "@/modules/ocr/preprocessing/create-image-data";
import { computeHistogram } from "@/modules/ocr/preprocessing/histogram";

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

describe("computeOtsuThreshold", () => {
  it("imagen bimodal (128 píxeles en 0, 128 en 255): threshold cerca de 127.5", () => {
    const values = [...new Array(128).fill(0), ...new Array(128).fill(255)];
    const input = createImageData(grayPixels(values), 16, 16);
    const threshold = computeOtsuThreshold(input);
    expect(threshold).toBeGreaterThanOrEqual(1);
    expect(threshold).toBeLessThanOrEqual(255);
    expect(Math.abs(threshold - 127.5)).toBeLessThan(2);
  });

  it("imagen completamente uniforme: no falla, devuelve un threshold neutral (128)", () => {
    const input = createImageData(grayPixels([100, 100, 100, 100]), 4, 1);
    expect(computeOtsuThreshold(input)).toBe(128);
  });

  it("acepta un histograma precomputado y da el mismo resultado que calculándolo internamente", () => {
    const values = [...new Array(128).fill(0), ...new Array(128).fill(255)];
    const input = createImageData(grayPixels(values), 16, 16);
    const withoutHist = computeOtsuThreshold(input);
    const withHist = computeOtsuThreshold(input, computeHistogram(input));
    expect(withHist).toBe(withoutHist);
  });
});

describe("otsuBinarization", () => {
  it("la salida solo contiene 0 o 255 (nunca valores intermedios)", () => {
    const values = [0, 40, 80, 120, 160, 200, 255];
    const input = createImageData(grayPixels(values), values.length, 1);
    const result = otsuBinarization(input);
    for (let i = 0; i < result.data.length; i += 4) {
      expect([0, 255]).toContain(result.data[i]);
    }
  });

  it("elige el umbral que separa correctamente dos clusters no equidistantes", () => {
    // píxeles [0, 0, 100, 200]: a mano, el mejor split (mayor varianza
    // entre clases) separa {0,0} de {100,200}, no {0,0,100} de {200}:
    //   split en 0|100:   w0=0.5,  w1=0.5,  mu0=0,      mu1=150   -> var = 0.5*0.5*150^2      = 5625
    //   split en 100|200: w0=0.75, w1=0.25, mu0=33.33,  mu1=200   -> var = 0.75*0.25*166.67^2 ≈ 5208.33
    // 5625 > 5208.33, así que Otsu agrupa 100 y 200 en la clase alta.
    const input = createImageData(grayPixels([0, 0, 100, 200]), 4, 1);
    const result = otsuBinarization(input);
    expect(result.data[0]).toBe(0);
    expect(result.data[4]).toBe(0);
    expect(result.data[8]).toBe(255);
    expect(result.data[12]).toBe(255);
  });

  it("imagen completamente uniforme no revienta y produce una salida consistente", () => {
    const input = createImageData(grayPixels([50, 50, 50, 50]), 4, 1);
    const result = otsuBinarization(input);
    const firstValue = result.data[0];
    expect([0, 255]).toContain(firstValue);
    for (let i = 0; i < result.data.length; i += 4) {
      expect(result.data[i]).toBe(firstValue);
    }
  });

  it("preserva el canal alfa", () => {
    const input = createImageData(Uint8ClampedArray.from([10, 10, 10, 200, 240, 240, 240, 100]), 2, 1);
    const result = otsuBinarization(input);
    expect(result.data[3]).toBe(200);
    expect(result.data[7]).toBe(100);
  });

  it("conserva width y height", () => {
    const input = createImageData(grayPixels([0, 255, 0, 255, 0, 255]), 3, 2);
    const result = otsuBinarization(input);
    expect(result.width).toBe(3);
    expect(result.height).toBe(2);
  });

  it("thresholdMultiplier=1 (por defecto) no cambia el resultado de la fórmula original", () => {
    const input = createImageData(grayPixels([0, 0, 100, 200]), 4, 1);
    const withoutMultiplier = otsuBinarization(input);
    const withDefaultMultiplier = otsuBinarization(input, undefined, 1);
    expect(withDefaultMultiplier.data).toEqual(withoutMultiplier.data);
  });

  it("thresholdMultiplier > 1 sube el corte y reclasifica píxeles al límite como fondo (0)", () => {
    // threshold base = 51 (a mano, ver test "elige el umbral..." arriba:
    // el empate de varianza cubre t=1..100, punto medio = 51). Con
    // multiplier=2, threshold efectivo = 102: el píxel de valor 100 (que
    // con threshold=51 caía en la clase alta, 255) ahora cae por debajo
    // de 102 y pasa a la clase baja (0) -- el pixel de 200 se mantiene.
    const input = createImageData(grayPixels([0, 0, 100, 200]), 4, 1);
    const base = computeOtsuThreshold(input);
    expect(base).toBe(51);

    const result = otsuBinarization(input, undefined, 2);
    expect(result.data[0]).toBe(0);
    expect(result.data[4]).toBe(0);
    expect(result.data[8]).toBe(0); // antes 255 con threshold=51
    expect(result.data[12]).toBe(255);
  });
});
