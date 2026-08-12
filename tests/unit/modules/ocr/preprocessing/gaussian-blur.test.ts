import { describe, expect, it } from "vitest";
import { computeGaussianKernel3x3, gaussianBlur } from "@/modules/ocr/preprocessing/gaussian-blur";
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

describe("computeGaussianKernel3x3", () => {
  it("los pesos suman 1 (kernel normalizado)", () => {
    const kernel = computeGaussianKernel3x3(1);
    const sum = kernel.flat().reduce((acc, w) => acc + w, 0);
    expect(sum).toBeCloseTo(1, 10);
  });

  it("con sigma=1, pesos exactos: centro≈0.2042, ortogonal≈0.1238, esquina≈0.0751", () => {
    // peso(dx,dy) = e^(-(dx²+dy²)/2), suma = 1 + 4·e^-0.5 + 4·e^-1 ≈ 4.8976
    const kernel = computeGaussianKernel3x3(1);
    expect(kernel[1][1]).toBeCloseTo(0.2042, 4); // centro (dx=0,dy=0)
    expect(kernel[0][1]).toBeCloseTo(0.1238, 4); // ortogonal (dx=0,dy=-1)
    expect(kernel[0][0]).toBeCloseTo(0.0751, 4); // esquina (dx=-1,dy=-1)
  });

  it("es simétrico: los 4 vecinos ortogonales son iguales entre sí, igual que las 4 esquinas", () => {
    const kernel = computeGaussianKernel3x3(1.5);
    expect(kernel[0][1]).toBeCloseTo(kernel[1][0], 10);
    expect(kernel[1][0]).toBeCloseTo(kernel[1][2], 10);
    expect(kernel[1][2]).toBeCloseTo(kernel[2][1], 10);
    expect(kernel[0][0]).toBeCloseTo(kernel[0][2], 10);
    expect(kernel[0][2]).toBeCloseTo(kernel[2][0], 10);
    expect(kernel[2][0]).toBeCloseTo(kernel[2][2], 10);
  });
});

describe("gaussianBlur", () => {
  it("una imagen uniforme se mantiene igual (promedio ponderado de valores idénticos = el mismo valor)", () => {
    const input = createImageData(grayPixels(new Array(9).fill(180)), 3, 3);
    const result = gaussianBlur(input, 1);
    for (let i = 0; i < result.data.length; i += 4) {
      expect(result.data[i]).toBe(180);
    }
  });

  it("un píxel negro aislado en fondo blanco se difumina (no desaparece del todo, no queda intacto)", () => {
    // prettier-ignore
    const values = [
      255, 255, 255,
      255, 0, 255,
      255, 255, 255,
    ];
    const input = createImageData(grayPixels(values), 3, 3);
    const result = gaussianBlur(input, 1);
    // acc = 0·0.2042 + 4·255·0.1238 + 4·255·0.0751 ≈ 202.92 -> redondea a 203
    // (a diferencia de denoise/mediana, que en una imagen BINARIA borraría
    // el píxel aislado a 255 por completo -- el blur solo lo atenúa)
    expect(result.data[4 * 4]).toBe(203);
    expect(result.data[4 * 4]).not.toBe(0);
    expect(result.data[4 * 4]).not.toBe(255);
  });

  it("usa replicación de borde: la esquina no se trata como rodeada de negro", () => {
    // prettier-ignore
    const values = [
      0, 255, 255,
      255, 255, 255,
      255, 255, 255,
    ];
    const input = createImageData(grayPixels(values), 3, 3);
    const result = gaussianBlur(input, 1);
    // esquina (0,0): con replicación, los vecinos fuera de límite repiten
    // el propio valor 0 -- de los 9 pesos del kernel centrado ahí, los que
    // caen en (0,0) real [dy=-1,dx=-1 / dy=-1,dx=0 / dy=0,dx=-1 / dy=0,dx=0]
    // valen esquina+ortog+ortog+centro y multiplican 0; el resto (3
    // posiciones que mapean a la esquina superior-derecha/inferior, valor
    // real 255, con pesos esquina·3 + ortog·2) multiplica 255:
    // acc = 255·(3·esquina + 2·ortog)
    const kernel = computeGaussianKernel3x3(1);
    const corner = kernel[0][0];
    const edge = kernel[0][1];
    const expected = Math.round(255 * (3 * corner + 2 * edge));
    expect(result.data[0]).toBe(expected);
  });

  it("preserva el canal alfa", () => {
    const values = [0, 0, 0, 0, 255, 0, 0, 0, 0];
    const data = grayPixels(values);
    data[4 * 4 + 3] = 128;
    const input = createImageData(data, 3, 3);
    const result = gaussianBlur(input, 1);
    expect(result.data[4 * 4 + 3]).toBe(128);
  });

  it("conserva width y height", () => {
    const input = createImageData(new Uint8ClampedArray(5 * 4 * 4), 5, 4);
    const result = gaussianBlur(input, 1);
    expect(result.width).toBe(5);
    expect(result.height).toBe(4);
  });

  it("usa sigma=1 por defecto", () => {
    const values = [255, 255, 255, 255, 0, 255, 255, 255, 255];
    const input = createImageData(grayPixels(values), 3, 3);
    const withDefault = gaussianBlur(input);
    const withExplicit = gaussianBlur(input, 1);
    expect(Array.from(withDefault.data)).toEqual(Array.from(withExplicit.data));
  });
});
