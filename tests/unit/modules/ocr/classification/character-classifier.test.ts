import { describe, expect, it } from "vitest";
import { CharacterClassifier } from "@/modules/ocr/classification/character-classifier";
import { createImageData } from "@/modules/ocr/preprocessing/create-image-data";

const SIZE = 32;

function blankChar(): Uint8ClampedArray {
  const data = new Uint8ClampedArray(SIZE * SIZE * 4);
  for (let i = 0; i < SIZE * SIZE; i++) data[i * 4 + 3] = 255; // alfa opaco, resto 0 (negro)
  return data;
}

function setPixel(data: Uint8ClampedArray, x: number, y: number, value: number) {
  if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return;
  const idx = (y * SIZE + x) * 4;
  data[idx] = data[idx + 1] = data[idx + 2] = value;
  data[idx + 3] = 255;
}

/** Forma "barra vertical" (parecida a un "1"), en la columna `x0`. */
function verticalBarChar(x0: number): ImageData {
  const data = blankChar();
  for (let y = 6; y < 26; y++) {
    setPixel(data, x0, y, 255);
    setPixel(data, x0 + 1, y, 255);
  }
  return createImageData(data, SIZE, SIZE);
}

/** Forma "diagonal" (parecida a un "/"), desplazada `offset` columnas. */
function diagonalChar(offset: number): ImageData {
  const data = blankChar();
  for (let i = 0; i < 20; i++) {
    setPixel(data, 6 + offset + i, 25 - i, 255);
    setPixel(data, 7 + offset + i, 25 - i, 255);
  }
  return createImageData(data, SIZE, SIZE);
}

describe("CharacterClassifier", () => {
  it("entrena con dos formas claramente distintas (barra vertical vs diagonal) y predice correctamente variantes nuevas con confidence alta", () => {
    const classifier = new CharacterClassifier();

    const bars = [10, 12, 14, 16, 18, 11, 13, 15].map((x) => ({ imageData: verticalBarChar(x), label: "1" }));
    const diagonals = [0, 1, 2, 3, 4, 0, 1, 2].map((offset) => ({ imageData: diagonalChar(offset), label: "7" }));
    classifier.train([...bars, ...diagonals]);

    const barPrediction = classifier.predict(verticalBarChar(17));
    expect(barPrediction.label).toBe("1");
    expect(barPrediction.confidence).toBeGreaterThan(0.7);

    const diagonalPrediction = classifier.predict(diagonalChar(3));
    expect(diagonalPrediction.label).toBe("7");
    expect(diagonalPrediction.confidence).toBeGreaterThan(0.7);
  });

  it("topN incluye ambas labels cuando k es lo bastante grande para alcanzar las dos clases", () => {
    const classifier = new CharacterClassifier();
    const bars = [10, 12, 14].map((x) => ({ imageData: verticalBarChar(x), label: "1" }));
    const diagonals = [0, 1, 2].map((offset) => ({ imageData: diagonalChar(offset), label: "7" }));
    classifier.train([...bars, ...diagonals]);

    // k=6 -> entran los 6 vecinos de entrenamiento (3 "1" + 3 "7"),
    // así que topN debe reportar ambas labels.
    const prediction = classifier.predict(verticalBarChar(11), 6);
    expect(prediction.topN.map((entry) => entry.label).sort()).toEqual(["1", "7"]);
    expect(prediction.label).toBe("1");
  });
});
