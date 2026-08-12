import { describe, expect, it } from "vitest";
import { computeCharacterMetrics, evaluateCharacterRecognition } from "@/modules/ocr/evaluation/character-metrics";
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

function trainedClassifier(): CharacterClassifier {
  const classifier = new CharacterClassifier();
  classifier.train([
    { imageData: verticalBarChar(10), label: "1" },
    { imageData: verticalBarChar(12), label: "1" },
    { imageData: verticalBarChar(14), label: "1" },
    { imageData: diagonalChar(0), label: "7" },
    { imageData: diagonalChar(2), label: "7" },
    { imageData: diagonalChar(4), label: "7" },
  ]);
  return classifier;
}

describe("evaluateCharacterRecognition", () => {
  it("caso perfecto: todas las predicciones correctas -> accuracy 1, matriz diagonal", () => {
    const model = trainedClassifier();
    const testSet = [
      { imageData: verticalBarChar(11), expectedLabel: "1" },
      { imageData: verticalBarChar(13), expectedLabel: "1" },
      { imageData: diagonalChar(1), expectedLabel: "7" },
      { imageData: diagonalChar(3), expectedLabel: "7" },
    ];

    const metrics = evaluateCharacterRecognition(testSet, model);

    expect(metrics.totalCharactersProcessed).toBe(4);
    expect(metrics.correctCharacters).toBe(4);
    expect(metrics.accuracy).toBe(1);
    expect(metrics.perClassAccuracy).toEqual({ "1": 1, "7": 1 });
    expect(metrics.confusionMatrix).toEqual([
      [2, 0],
      [0, 2],
    ]);
    expect(metrics.commonMisclassifications).toEqual([]);
  });

  it("caso con errores deliberados: 2 muestras con forma de barra etiquetadas '7' -> confusión '7'→'1' contada exacta", () => {
    const model = trainedClassifier();
    // 5 barras reales etiquetadas '1' (correctas), 3 diagonales reales
    // etiquetadas '7' (correctas), 2 "impostoras" con forma de barra pero
    // etiquetadas '7' (predicirán '1' -- error real y esperado)
    const testSet = [
      { imageData: verticalBarChar(10), expectedLabel: "1" },
      { imageData: verticalBarChar(11), expectedLabel: "1" },
      { imageData: verticalBarChar(12), expectedLabel: "1" },
      { imageData: verticalBarChar(13), expectedLabel: "1" },
      { imageData: verticalBarChar(14), expectedLabel: "1" },
      { imageData: diagonalChar(0), expectedLabel: "7" },
      { imageData: diagonalChar(1), expectedLabel: "7" },
      { imageData: diagonalChar(2), expectedLabel: "7" },
      { imageData: verticalBarChar(20), expectedLabel: "7" }, // impostora
      { imageData: verticalBarChar(21), expectedLabel: "7" }, // impostora
    ];

    const metrics = evaluateCharacterRecognition(testSet, model);

    expect(metrics.totalCharactersProcessed).toBe(10);
    expect(metrics.correctCharacters).toBe(8);
    expect(metrics.accuracy).toBe(0.8);
    expect(metrics.perClassAccuracy).toEqual({ "1": 1, "7": 0.6 }); // 3/5 correctas para '7'
    expect(metrics.labels).toEqual(["1", "7"]);
    expect(metrics.confusionMatrix).toEqual([
      [5, 0], // true '1': 5 predichas '1'
      [2, 3], // true '7': 2 predichas '1' (impostoras), 3 predichas '7'
    ]);
    expect(metrics.commonMisclassifications).toEqual([{ actual: "7", predicted: "1", count: 2 }]);
  });

  it("computeCharacterMetrics (nivel de descriptor, sin ImageData) da el mismo resultado que evaluateCharacterRecognition para las mismas predicciones", () => {
    // Simula lo que hace la evaluacion real contra ocr_training_samples
    // (descriptores ya extraidos, no ImageData) -- mismas 10 muestras del
    // test anterior, expresadas ya como pares expected/predicted.
    const predictions = [
      { expected: "1", predicted: "1" },
      { expected: "1", predicted: "1" },
      { expected: "1", predicted: "1" },
      { expected: "1", predicted: "1" },
      { expected: "1", predicted: "1" },
      { expected: "7", predicted: "7" },
      { expected: "7", predicted: "7" },
      { expected: "7", predicted: "7" },
      { expected: "7", predicted: "1" },
      { expected: "7", predicted: "1" },
    ];
    const metrics = computeCharacterMetrics(predictions);
    expect(metrics.accuracy).toBe(0.8);
    expect(metrics.confusionMatrix).toEqual([
      [5, 0],
      [2, 3],
    ]);
    expect(metrics.commonMisclassifications).toEqual([{ actual: "7", predicted: "1", count: 2 }]);
  });

  it("testSet vacío: accuracy 0 (no NaN), sin reventar", () => {
    const model = trainedClassifier();
    const metrics = evaluateCharacterRecognition([], model);

    expect(metrics.totalCharactersProcessed).toBe(0);
    expect(metrics.accuracy).toBe(0);
    expect(metrics.labels).toEqual([]);
    expect(metrics.confusionMatrix).toEqual([]);
  });
});
