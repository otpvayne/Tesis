import { describe, expect, it } from "vitest";
import { buildOcrDebugReport } from "@/modules/ocr/debug/build-debug-report";
import { runOCRPipelineOnImageData } from "@/modules/ocr/pipeline/ocr-pipeline";
import { CharacterClassifier } from "@/modules/ocr/classification/character-classifier";
import { normalizeCharacter } from "@/modules/ocr/segmentation/normalize-character";
import { createImageData } from "@/modules/ocr/preprocessing/create-image-data";
import { OCR_CONFIG } from "@/modules/ocr/config";

/**
 * Misma factura sintética y clasificador que `pipeline/ocr-pipeline.test.ts`
 * (duplicados aquí a propósito, no importados desde ese archivo de test —
 * mismo criterio ya usado en todo `tests/unit/modules/ocr`: cada archivo de
 * test es autocontenido, ver `segmentation/test-helpers.ts` vs. los tests
 * que arman su propia imagen a mano). El objetivo de este archivo no es
 * volver a probar el pipeline (eso ya lo cubre `ocr-pipeline.test.ts`), es
 * verificar que `buildOcrDebugReport` **captura correctamente cada etapa
 * intermedia** sin cambiar el resultado final.
 */
const WIDTH = 240;
const HEIGHT = 140;
const STROKE = 12;

function blankInvoice(): Uint8ClampedArray {
  const data = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
  for (let i = 0; i < WIDTH * HEIGHT; i++) {
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = 230;
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

function drawBar(data: Uint8ClampedArray, width: number, height: number, x0: number, y0: number) {
  for (let y = y0; y < y0 + 20; y++) {
    for (let dx = 0; dx < STROKE; dx++) setPixel(data, width, height, x0 + dx, y, 20);
  }
}

function drawDiagonal(data: Uint8ClampedArray, width: number, height: number, x0: number, y0: number) {
  for (let i = 0; i < 20; i++) {
    for (let dx = 0; dx < STROKE; dx++) setPixel(data, width, height, x0 + i + dx, y0 + i, 20);
  }
}

function trainingCharacter(draw: (data: Uint8ClampedArray, w: number, h: number) => void, w: number, h: number): ImageData {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data[i * 4 + 3] = 255;
  draw(data, w, h);
  const pixels = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const value = data[i * 4] === 20 ? 255 : 0;
    pixels[i * 4] = pixels[i * 4 + 1] = pixels[i * 4 + 2] = value;
    pixels[i * 4 + 3] = 255;
  }
  return normalizeCharacter({ width: w, height: h, pixels });
}

function trainedClassifier(): CharacterClassifier {
  const barChar = trainingCharacter((data, w, h) => drawBar(data, w, h, 0, 0), STROKE, 20);
  const diagonalChar = trainingCharacter((data, w, h) => drawDiagonal(data, w, h, 0, 0), STROKE + 19, 20);

  const classifier = new CharacterClassifier();
  classifier.train([
    { imageData: barChar, label: "1" },
    { imageData: diagonalChar, label: "7" },
  ]);
  return classifier;
}

function makeSyntheticInvoice(): ImageData {
  const data = blankInvoice();
  drawBar(data, WIDTH, HEIGHT, 20, 10);
  drawBar(data, WIDTH, HEIGHT, 60, 10);
  drawDiagonal(data, WIDTH, HEIGHT, 20, 60);
  return createImageData(data, WIDTH, HEIGHT);
}

describe("buildOcrDebugReport", () => {
  it("captura las 5 etapas de preprocesamiento, en orden, todas con las dimensiones de la imagen original", () => {
    const invoice = makeSyntheticInvoice();
    const classifier = trainedClassifier();

    const report = buildOcrDebugReport(invoice, classifier);

    expect(report.stages.map((s) => s.name)).toEqual(["grayscale", "normalized", "blurred", "binary", "foreground"]);
    for (const stage of report.stages) {
      expect(stage.imageData.width).toBe(WIDTH);
      expect(stage.imageData.height).toBe(HEIGHT);
    }
    expect(report.originalImageData).toBe(invoice);
  });

  it("el texto reconstruido a partir de las líneas/palabras/caracteres coincide con runOCRPipelineOnImageData sobre la misma imagen", () => {
    const invoice = makeSyntheticInvoice();
    const classifier = trainedClassifier();

    const report = buildOcrDebugReport(invoice, classifier);
    const pipelineResult = runOCRPipelineOnImageData(invoice, classifier);

    const reportText = report.lines.map((line) => line.text).join("\n");
    expect(reportText).toBe(pipelineResult.rawText);
    expect(report.lines).toHaveLength(2);
    expect(report.lines[0].text).toBe("1 1");
    expect(report.lines[1].text).toBe("7");
  });

  it("cada carácter trae un descriptor HOG de 108 dimensiones y una predicción con confidence en (0, 1]", () => {
    const invoice = makeSyntheticInvoice();
    const classifier = trainedClassifier();

    const report = buildOcrDebugReport(invoice, classifier);
    const allCharacters = report.lines.flatMap((line) => line.words.flatMap((word) => word.characters));

    expect(allCharacters.length).toBeGreaterThan(0);
    for (const character of allCharacters) {
      expect(character.hogDescriptor).toHaveLength(
        OCR_CONFIG.HOG_GRID_COLS * OCR_CONFIG.HOG_GRID_ROWS * OCR_CONFIG.HOG_ORIENTATION_BINS,
      );
      expect(character.normalizedImageData.width).toBe(OCR_CONFIG.CHAR_SIZE);
      expect(character.normalizedImageData.height).toBe(OCR_CONFIG.CHAR_SIZE);
      expect(character.prediction.confidence).toBeGreaterThan(0);
      expect(character.prediction.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("las primeras 2 palabras reconocidas son '1' con el bbox donde se dibujó cada barra", () => {
    const invoice = makeSyntheticInvoice();
    const classifier = trainedClassifier();

    const report = buildOcrDebugReport(invoice, classifier);
    const firstLineWords = report.lines[0].words;

    expect(firstLineWords).toHaveLength(2);
    expect(firstLineWords[0].characters[0].prediction.label).toBe("1");
    expect(firstLineWords[0].bbox.x).toBeLessThanOrEqual(23);
  });

  it("mide timingMs real, total = suma de las tres etapas", () => {
    const invoice = makeSyntheticInvoice();
    const classifier = trainedClassifier();

    const report = buildOcrDebugReport(invoice, classifier);

    expect(report.timingMs.preprocess).toBeGreaterThan(0);
    expect(report.timingMs.total).toBeCloseTo(
      report.timingMs.preprocess + report.timingMs.segmentation + report.timingMs.recognition,
      5,
    );
  });

  it("una imagen en blanco no revienta y produce 0 líneas (mismo comportamiento que runOCRPipelineOnImageData)", () => {
    const blank = createImageData(blankInvoice(), WIDTH, HEIGHT);
    const classifier = trainedClassifier();

    const report = buildOcrDebugReport(blank, classifier);

    expect(report.lines).toHaveLength(0);
  });
});
