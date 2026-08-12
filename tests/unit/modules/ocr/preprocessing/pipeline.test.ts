import { describe, expect, it } from "vitest";
import { toGrayscale } from "@/modules/ocr/preprocessing/grayscale";
import { normalizeRange } from "@/modules/ocr/preprocessing/normalize";
import { otsuBinarization } from "@/modules/ocr/preprocessing/otsu-binarization";
import { denoise } from "@/modules/ocr/preprocessing/denoise";
import { createImageData } from "@/modules/ocr/preprocessing/create-image-data";

/**
 * Test de integración del pipeline completo de Fase 4a:
 * grayscale → normalize → otsu → denoise, sobre una imagen sintética de
 * 10×10 (RGBA con color y algo de "ruido" simulado) sin pasar por
 * `decodeImage`.
 *
 * No arranca desde un archivo PNG real: eso requeriría `decodeImage`
 * (createImageBitmap + canvas real), que jsdom no implementa — ver la
 * nota de cobertura en `decode-image.test.ts`. Este test cubre en cambio
 * exactamente lo que sí es 100% real y verificable sin navegador: que las
 * cuatro funciones de transformación de `ImageData` encadenadas producen
 * una imagen binaria válida, consistente en tamaño con la entrada.
 */

function makeSyntheticInvoicePhoto(width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      // Franja superior "papel" clara con tinte de color (simula luz
      // amarillenta), franja inferior "texto" oscura, con un par de
      // píxeles de ruido aislado intercalados.
      const isTextRow = y >= height / 2;
      const isNoisePixel = (x === 1 && y === 2) || (x === 8 && y === 7);
      const base = isTextRow ? 30 : 210;
      const value = isNoisePixel ? (isTextRow ? 210 : 30) : base;
      data[i] = value; // R
      data[i + 1] = value - 5 < 0 ? value : value - 5; // G (leve tinte)
      data[i + 2] = value; // B
      data[i + 3] = 255;
    }
  }
  return createImageData(data, width, height);
}

describe("pipeline de preprocesamiento: grayscale -> normalize -> otsu -> denoise", () => {
  it("produce una ImageData final estrictamente binaria (solo 0 o 255)", () => {
    const input = makeSyntheticInvoicePhoto(10, 10);

    const gray = toGrayscale(input);
    const normalized = normalizeRange(gray);
    const binary = otsuBinarization(normalized);
    const clean = denoise(binary, 3);

    for (let i = 0; i < clean.data.length; i += 4) {
      expect([0, 255]).toContain(clean.data[i]);
      // R=G=B en cada etapa desde grayscale en adelante.
      expect(clean.data[i]).toBe(clean.data[i + 1]);
      expect(clean.data[i]).toBe(clean.data[i + 2]);
    }
  });

  it("conserva las dimensiones originales en cada etapa", () => {
    const input = makeSyntheticInvoicePhoto(10, 10);
    const gray = toGrayscale(input);
    const normalized = normalizeRange(gray);
    const binary = otsuBinarization(normalized);
    const clean = denoise(binary, 3);

    for (const stage of [gray, normalized, binary, clean]) {
      expect(stage.width).toBe(10);
      expect(stage.height).toBe(10);
      expect(stage.data.length).toBe(10 * 10 * 4);
    }
  });

  it("el denoise final elimina los píxeles de ruido aislado inyectados en la imagen sintética", () => {
    const input = makeSyntheticInvoicePhoto(10, 10);
    const gray = toGrayscale(input);
    const normalized = normalizeRange(gray);
    const binaryBeforeDenoise = otsuBinarization(normalized);
    const clean = denoise(binaryBeforeDenoise, 3);

    // El píxel de ruido en (1,2) rompía el patrón "papel claro" de su
    // fila; tras denoise debe volver a coincidir con sus vecinos.
    const idxNoise1 = (2 * 10 + 1) * 4;
    const idxNeighbor1 = (2 * 10 + 0) * 4;
    expect(clean.data[idxNoise1]).toBe(clean.data[idxNeighbor1]);

    const idxNoise2 = (7 * 10 + 8) * 4;
    const idxNeighbor2 = (7 * 10 + 7) * 4;
    expect(clean.data[idxNoise2]).toBe(clean.data[idxNeighbor2]);
  });

  it("distingue la mitad 'papel' (clara) de la mitad 'texto' (oscura) tras binarizar", () => {
    const input = makeSyntheticInvoicePhoto(10, 10);
    const gray = toGrayscale(input);
    const normalized = normalizeRange(gray);
    const binary = otsuBinarization(normalized);

    // Fila 0 (papel, clara) y fila 9 (texto, oscura) deben terminar en
    // clases distintas tras la binarización.
    const paperPixel = binary.data[(0 * 10 + 5) * 4];
    const textPixel = binary.data[(9 * 10 + 5) * 4];
    expect(paperPixel).not.toBe(textPixel);
  });
});
