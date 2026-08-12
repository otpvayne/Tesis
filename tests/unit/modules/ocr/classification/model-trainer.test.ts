import { describe, expect, it } from "vitest";
import { trainModel } from "@/modules/ocr/classification/model-trainer";
import { Dataset, type TrainingSample } from "@/modules/ocr/classification/dataset";
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

function sample(imageData: ImageData, label: string, doc: string): TrainingSample {
  return { characterImageData: imageData, label, sourceDocument: doc, confidence: 1 };
}

describe("trainModel", () => {
  it("con dos formas claramente separables, accuracy=1, matriz de confusión diagonal, precision/recall=1 para ambas labels", () => {
    const bars = [10, 11, 12, 13, 14].map((x, i) => sample(verticalBarChar(x), "1", `bar-${i}`));
    const diagonals = [0, 1, 2, 3, 4].map((o, i) => sample(diagonalChar(o), "7", `diag-${i}`));
    const dataset = new Dataset([...bars, ...diagonals]);

    const result = trainModel(dataset, 3, 0.8);

    expect(result.metrics.labels).toEqual(["1", "7"]);
    expect(result.metrics.accuracy).toBe(1);
    // 5 muestras por label, trainRatio=0.8 -> round(4)=4 train, 1 test por label
    expect(result.metrics.confusionMatrix).toEqual([
      [1, 0],
      [0, 1],
    ]);
    expect(result.metrics.precision).toEqual({ "1": 1, "7": 1 });
    expect(result.metrics.recall).toEqual({ "1": 1, "7": 1 });
    expect(result.generalizationWarning).toBeUndefined();
    expect(result.trainingTime).toBeGreaterThanOrEqual(0);
  });

  it("un caso difícil (muestra de test con forma equivocada) queda registrado a mano en la matriz de confusión", () => {
    // label "1": 5 barras verticales reales -> split 0.8 = 4 train, 1 test (todas barras reales)
    // label "7": 4 diagonales reales + 1 "impostora" con forma de barra
    // vertical al final -> split 0.8 = 4 train (las 4 diagonales reales),
    // 1 test (la impostora, forma de barra pero etiquetada "7")
    const bars = [10, 11, 12, 13, 14].map((x, i) => sample(verticalBarChar(x), "1", `bar-${i}`));
    const diagonals = [0, 1, 2, 3].map((o, i) => sample(diagonalChar(o), "7", `diag-${i}`));
    const impostor = sample(verticalBarChar(20), "7", "impostor"); // forma de "1", etiquetado "7"
    const dataset = new Dataset([...bars, ...diagonals, impostor]);

    const result = trainModel(dataset, 3, 0.8);

    expect(result.metrics.labels).toEqual(["1", "7"]);
    // test: 1 barra real (etiqueta "1", predicha "1" -- correcta) +
    // 1 impostora (etiqueta "7", forma de barra -> predicha "1" -- error)
    expect(result.metrics.accuracy).toBe(0.5);
    expect(result.metrics.confusionMatrix).toEqual([
      [1, 0], // true "1": 1 predicha como "1"
      [1, 0], // true "7": 1 predicha como "1" (la impostora)
    ]);
    expect(result.metrics.precision).toEqual({ "1": 0.5, "7": 0 });
    expect(result.metrics.recall).toEqual({ "1": 1, "7": 0 });
    // 0.5 < MIN_ACCURACY_THRESHOLD (0.8) -> debe avisar
    expect(result.generalizationWarning).toBeDefined();
  });

  it("lanza si la partición de entrenamiento queda vacía", () => {
    const dataset = new Dataset([sample(verticalBarChar(10), "1", "a")]);
    // 1 muestra, trainRatio muy bajo -> round(1*0.05)=0 train
    expect(() => trainModel(dataset, 3, 0.05)).toThrow();
  });

  it("accuracy es null (no 0) cuando la partición de test queda vacía", () => {
    const bars = [10, 11, 12].map((x, i) => sample(verticalBarChar(x), "1", `bar-${i}`));
    const dataset = new Dataset(bars);
    // 3 muestras, trainRatio=0.99 -> round(2.97)=3 train, 0 test
    const result = trainModel(dataset, 3, 0.99);
    expect(result.metrics.accuracy).toBeNull();
  });
});
