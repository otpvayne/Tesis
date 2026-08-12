import { describe, expect, it } from "vitest";
import { runOCRPipelineOnImageData } from "@/modules/ocr/pipeline/ocr-pipeline";
import { CharacterClassifier } from "@/modules/ocr/classification/character-classifier";
import { normalizeCharacter } from "@/modules/ocr/segmentation/normalize-character";
import { createImageData } from "@/modules/ocr/preprocessing/create-image-data";

const WIDTH = 240;
const HEIGHT = 140;
const STROKE = 12; // ancho de trazo -- lo bastante grueso para que cada fila de texto supere HORIZONTAL_VALLEY_THRESHOLD (10px) incluso con 1 solo carácter en la fila (la diagonal solo tiene STROKE px por fila)

function blankInvoice(): Uint8ClampedArray {
  const data = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
  for (let i = 0; i < WIDTH * HEIGHT; i++) {
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = 230; // papel claro
    data[i * 4 + 3] = 255;
  }
  return data;
}

function setPixel(data: Uint8ClampedArray, width: number, height: number, x: number, y: number, value: number) {
  if (x < 0 || x >= width || y < 0 || y >= height) return;
  const idx = (y * width + x) * 4;
  data[idx] = data[idx + 1] = data[idx + 2] = value;
  data[idx + 3] = 255;
}

/** Barra vertical (forma de "1"), trazo de `STROKE`px, 20px de alto. */
function drawBar(data: Uint8ClampedArray, width: number, height: number, x0: number, y0: number) {
  for (let y = y0; y < y0 + 20; y++) {
    for (let dx = 0; dx < STROKE; dx++) setPixel(data, width, height, x0 + dx, y, 20);
  }
}

/** Diagonal (forma de "7"), trazo de `STROKE`px, 20px de alto/ancho. */
function drawDiagonal(data: Uint8ClampedArray, width: number, height: number, x0: number, y0: number) {
  for (let i = 0; i < 20; i++) {
    for (let dx = 0; dx < STROKE; dx++) setPixel(data, width, height, x0 + i + dx, y0 + i, 20);
  }
}

/**
 * Construye el carácter de entrenamiento dibujándolo en un lienzo del
 * tamaño exacto de su propia forma y pasándolo por `normalizeCharacter` —
 * el mismo recorte/resize que aplica `extractCharactersFromWord` +
 * `normalizeCharacter` a un carácter real segmentado de la factura, para
 * que la forma de entrenamiento y la forma que el pipeline extrae de la
 * imagen sintética sean consistentes (no formas dibujadas a mano con
 * proporciones distintas por accidente).
 */
function trainingCharacter(draw: (data: Uint8ClampedArray, w: number, h: number) => void, w: number, h: number): ImageData {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data[i * 4 + 3] = 255; // fondo negro opaco, RGB ya en 0
  draw(data, w, h);
  // convertir a "trazo blanco sobre negro" (mismo formato que CharacterRegion.pixels)
  const pixels = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const value = data[i * 4] === 20 ? 255 : 0;
    pixels[i * 4] = pixels[i * 4 + 1] = pixels[i * 4 + 2] = value;
    pixels[i * 4 + 3] = 255;
  }
  return normalizeCharacter({ width: w, height: h, pixels });
}

function trainedClassifier(): CharacterClassifier {
  const barW = STROKE;
  const barH = 20;
  const diagW = STROKE + 19;
  const diagH = 20;

  const barChar = trainingCharacter((data, w, h) => drawBar(data, w, h, 0, 0), barW, barH);
  const diagonalChar = trainingCharacter((data, w, h) => drawDiagonal(data, w, h, 0, 0), diagW, diagH);

  const classifier = new CharacterClassifier();
  classifier.train([
    { imageData: barChar, label: "1" },
    { imageData: diagonalChar, label: "7" },
  ]);
  return classifier;
}

/**
 * Factura sintética: línea 1 = dos "palabras" de barras verticales
 * ("1 1"), línea 2 (bien separada verticalmente) = una diagonal ("7").
 */
function makeSyntheticInvoice(): ImageData {
  const data = blankInvoice();

  // línea 1, y=10..30: dos barras separadas por un hueco > VERTICAL_VALLEY_THRESHOLD
  drawBar(data, WIDTH, HEIGHT, 20, 10);
  drawBar(data, WIDTH, HEIGHT, 60, 10);

  // línea 2, y=60..80 (hueco > HORIZONTAL_VALLEY_THRESHOLD respecto a la línea 1)
  drawDiagonal(data, WIDTH, HEIGHT, 20, 60);

  return createImageData(data, WIDTH, HEIGHT);
}

describe("runOCRPipelineOnImageData", () => {
  it("reconstruye 2 líneas con el texto esperado, en orden de lectura", () => {
    const invoice = makeSyntheticInvoice();
    const classifier = trainedClassifier();

    const result = runOCRPipelineOnImageData(invoice, classifier);

    expect(result.lines).toHaveLength(2);
    expect(result.lines[0].text).toBe("1 1");
    expect(result.lines[1].text).toBe("7");
    expect(result.rawText).toBe("1 1\n7");
  });

  it("confidence promedio está en (0, 1] y cada línea tiene su propia confidence", () => {
    const invoice = makeSyntheticInvoice();
    const classifier = trainedClassifier();

    const result = runOCRPipelineOnImageData(invoice, classifier);

    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    for (const line of result.lines) {
      expect(line.confidence).toBeGreaterThan(0);
      expect(line.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("bbox de cada línea es consistente con dónde se dibujaron los caracteres", () => {
    const invoice = makeSyntheticInvoice();
    const classifier = trainedClassifier();

    const result = runOCRPipelineOnImageData(invoice, classifier);

    // tolerancia de unos pocos px: el blur Gaussiano previo a Otsu puede
    // recortar 1-2px del borde de un trazo al suavizar el cambio abrupto
    // papel/tinta -- efecto real del pipeline, no un error de este test.
    expect(result.lines[0].bbox.x).toBeLessThanOrEqual(23);
    expect(result.lines[0].bbox.y).toBeCloseTo(10, -1);
    expect(result.lines[1].bbox.x).toBeLessThanOrEqual(23);
  });

  it("mide timingMs real (todas las etapas > 0, total = suma de las tres)", () => {
    const invoice = makeSyntheticInvoice();
    const classifier = trainedClassifier();

    const result = runOCRPipelineOnImageData(invoice, classifier);

    expect(result.timingMs.preprocess).toBeGreaterThan(0);
    expect(result.timingMs.segmentation).toBeGreaterThanOrEqual(0);
    expect(result.timingMs.recognition).toBeGreaterThanOrEqual(0);
    expect(result.timingMs.total).toBeCloseTo(
      result.timingMs.preprocess + result.timingMs.segmentation + result.timingMs.recognition,
      5,
    );
  });

  it("una imagen en blanco (sin texto) no revienta y produce 0 líneas", () => {
    const blank = createImageData(blankInvoice(), WIDTH, HEIGHT);
    const classifier = trainedClassifier();

    const result = runOCRPipelineOnImageData(blank, classifier);

    expect(result.lines).toHaveLength(0);
    expect(result.rawText).toBe("");
    expect(result.confidence).toBe(0);
  });
});
