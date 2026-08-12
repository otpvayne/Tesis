import { describe, expect, it } from "vitest";
import { testReproducibility } from "@/modules/ocr/evaluation/reproducibility-test";
import { CharacterClassifier } from "@/modules/ocr/classification/character-classifier";
import { normalizeCharacter } from "@/modules/ocr/segmentation/normalize-character";
import { createImageData } from "@/modules/ocr/preprocessing/create-image-data";

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
  const barChar = trainingCharacter((d, w, h) => drawBar(d, w, h, 0, 0), STROKE, 20);
  const diagonalChar = trainingCharacter((d, w, h) => drawDiagonal(d, w, h, 0, 0), STROKE + 19, 20);
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

describe("testReproducibility", () => {
  it("la misma factura sintética 5 veces da resultado 100% idéntico (sin fuente de aleatoriedad en el pipeline)", () => {
    const invoice = makeSyntheticInvoice();
    const classifier = trainedClassifier();

    const result = testReproducibility(invoice, classifier, 5);

    expect(result.sameImage).toBe(true);
    expect(result.sameOCRText).toBe(true);
    expect(result.sameExtractedFields).toBe(true);
    expect(result.confidence).toBe(1);
    expect(result.variance.characterConfidence).toBe(0);
    expect(result.variance.fieldValues).toBe(0);
  });

  it("con runs=1, trivialmente 100% reproducible", () => {
    const invoice = makeSyntheticInvoice();
    const classifier = trainedClassifier();
    const result = testReproducibility(invoice, classifier, 1);
    expect(result.confidence).toBe(1);
  });

  it("lanza si runs < 1", () => {
    const invoice = makeSyntheticInvoice();
    const classifier = trainedClassifier();
    expect(() => testReproducibility(invoice, classifier, 0)).toThrow();
  });
});
