import { describe, expect, it } from "vitest";
import { deserializeModel, serializeModel } from "@/modules/ocr/classification/model-persistence";
import { CharacterClassifier } from "@/modules/ocr/classification/character-classifier";
import { createImageData } from "@/modules/ocr/preprocessing/create-image-data";

const SIZE = 32;

function blank(): Uint8ClampedArray {
  const data = new Uint8ClampedArray(SIZE * SIZE * 4);
  for (let i = 0; i < SIZE * SIZE; i++) data[i * 4 + 3] = 255;
  return data;
}

function setPixel(data: Uint8ClampedArray, x: number, y: number, value: number) {
  if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return;
  const idx = (y * SIZE + x) * 4;
  data[idx] = data[idx + 1] = data[idx + 2] = value;
  data[idx + 3] = 255;
}

function verticalBarChar(x0: number): ImageData {
  const data = blank();
  for (let y = 6; y < 26; y++) {
    setPixel(data, x0, y, 255);
    setPixel(data, x0 + 1, y, 255);
  }
  return createImageData(data, SIZE, SIZE);
}

function diagonalChar(offset: number): ImageData {
  const data = blank();
  for (let i = 0; i < 20; i++) {
    setPixel(data, 6 + offset + i, 25 - i, 255);
    setPixel(data, 7 + offset + i, 25 - i, 255);
  }
  return createImageData(data, SIZE, SIZE);
}

describe("serializeModel / deserializeModel", () => {
  it("produce un JSON válido con las muestras entrenadas", () => {
    const classifier = new CharacterClassifier();
    classifier.train([
      { imageData: verticalBarChar(10), label: "1" },
      { imageData: diagonalChar(0), label: "7" },
    ]);

    const json = serializeModel(classifier);
    const parsed = JSON.parse(json);
    expect(parsed.samples).toHaveLength(2);
    expect(parsed.samples[0].descriptor).toHaveLength(108);
    expect(parsed.samples.map((s: { label: string }) => s.label).sort()).toEqual(["1", "7"]);
  });

  it("un modelo deserializado predice exactamente igual que el original", () => {
    const classifier = new CharacterClassifier();
    classifier.train([
      { imageData: verticalBarChar(10), label: "1" },
      { imageData: verticalBarChar(12), label: "1" },
      { imageData: diagonalChar(0), label: "7" },
      { imageData: diagonalChar(2), label: "7" },
    ]);

    const json = serializeModel(classifier);
    const restored = deserializeModel(json);

    const queryBar = verticalBarChar(11);
    const queryDiagonal = diagonalChar(1);

    expect(restored.predict(queryBar)).toEqual(classifier.predict(queryBar));
    expect(restored.predict(queryDiagonal)).toEqual(classifier.predict(queryDiagonal));
  });

  it("round-trip no pierde precisión de los descriptores (Float32Array -> number[] -> Float32Array)", () => {
    const classifier = new CharacterClassifier();
    classifier.train([{ imageData: verticalBarChar(10), label: "1" }]);

    const restored = deserializeModel(serializeModel(classifier));
    const query = verticalBarChar(10);
    // mismo descriptor exacto -> distancia 0 -> confidence maxima en ambos
    expect(restored.predict(query).confidence).toBe(classifier.predict(query).confidence);
  });
});
