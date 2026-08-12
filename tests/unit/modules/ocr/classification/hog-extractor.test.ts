import { describe, expect, it } from "vitest";
import { extractHOG } from "@/modules/ocr/classification/hog-extractor";
import { createImageData } from "@/modules/ocr/preprocessing/create-image-data";
import { OCR_CONFIG } from "@/modules/ocr/config";

function grayImage(values: number[], width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  values.forEach((v, i) => {
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  });
  return createImageData(data, width, height);
}

describe("extractHOG", () => {
  it("con los parámetros por defecto de OCR_CONFIG, el descriptor tiene 108 dimensiones", () => {
    const values = new Array(32 * 32).fill(0);
    const input = grayImage(values, 32, 32);
    const descriptor = extractHOG(input);
    expect(descriptor.length).toBe(108);
    expect(descriptor.length).toBe(OCR_CONFIG.HOG_GRID_COLS * OCR_CONFIG.HOG_GRID_ROWS * OCR_CONFIG.HOG_ORIENTATION_BINS);
  });

  it("imagen completamente uniforme: gradiente cero en todos lados, descriptor todo en cero", () => {
    const values = new Array(32 * 32).fill(180);
    const input = grayImage(values, 32, 32);
    const descriptor = extractHOG(input);
    for (let i = 0; i < descriptor.length; i++) {
      expect(descriptor[i]).toBe(0);
    }
  });

  it("borde vertical (mitad izquierda negra, mitad derecha blanca): gradiente puramente horizontal -> pico en el bin de 0°", () => {
    // 8x8, gridCols=1, gridRows=1, 9 bins -> una sola región cubre toda la
    // imagen. Para cualquier píxel interior de la mitad izquierda, borde
    // en x=3|4: Gx = derecha(255) - izquierda(0) = 255, Gy = 0 (columnas
    // vecinas iguales) -> angle = atan2(0,255) = 0° -> bin 0.
    const width = 8;
    const height = 8;
    const values = new Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        values[y * width + x] = x < width / 2 ? 0 : 255;
      }
    }
    const input = grayImage(values, width, height);
    const descriptor = extractHOG(input, { gridCols: 1, gridRows: 1, orientationBins: 9 });

    let maxBin = 0;
    for (let i = 1; i < 9; i++) if (descriptor[i] > descriptor[maxBin]) maxBin = i;
    expect(maxBin).toBe(0);
    expect(descriptor[0]).toBeGreaterThan(0);
  });

  it("borde diagonal '\\' (brillante donde x>y): gradiente a 135° -> pico en el bin de 140° (el más cercano a 135° con bins de 20°)", () => {
    // 8x8, gridCols=1, gridRows=1. Para un píxel interior sobre la
    // diagonal (x=y, ej. x=y=4): izquierda=(3,4): 3>4? no -> 0.
    // derecha=(5,4): 5>4? sí -> 255. Gx=255-0=255.
    // arriba=(4,3): 4>3? sí -> 255. abajo=(4,5): 4>5? no -> 0. Gy=0-255=-255.
    // angle = atan2(-255,255) = -45° -> plegado: -45+180 = 135°.
    // binIndex = round(135/20) = round(6.75) = 7 (centro 140°).
    const width = 8;
    const height = 8;
    const values = new Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        values[y * width + x] = x > y ? 255 : 0;
      }
    }
    const input = grayImage(values, width, height);
    const descriptor = extractHOG(input, { gridCols: 1, gridRows: 1, orientationBins: 9 });

    let maxBin = 0;
    for (let i = 1; i < 9; i++) if (descriptor[i] > descriptor[maxBin]) maxBin = i;
    expect(maxBin).toBe(7);
    expect(descriptor[7]).toBeGreaterThan(0);
  });

  it("cada región se normaliza L2 de forma independiente (norma ~1 si la región tiene algún gradiente)", () => {
    const width = 8;
    const height = 8;
    const values = new Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        values[y * width + x] = x < width / 2 ? 0 : 255;
      }
    }
    const input = grayImage(values, width, height);
    const descriptor = extractHOG(input, { gridCols: 1, gridRows: 1, orientationBins: 9 });

    let normSquared = 0;
    for (let i = 0; i < 9; i++) normSquared += descriptor[i] * descriptor[i];
    // norm = ‖h‖ / (‖h‖ + epsilon) ≈ 1, no exactamente 1 por el epsilon de estabilidad
    expect(Math.sqrt(normSquared)).toBeCloseTo(1, 2);
  });
});
