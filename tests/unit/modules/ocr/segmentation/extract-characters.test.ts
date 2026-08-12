import { describe, expect, it } from "vitest";
import { extractCharactersFromWord } from "@/modules/ocr/segmentation/extract-characters";
import { findConnectedComponents } from "@/modules/ocr/segmentation/connected-components";
import type { WordRegion } from "@/modules/ocr/segmentation/extract-words";
import type { Component } from "@/modules/ocr/segmentation/connected-components";
import { OCR_CONFIG } from "@/modules/ocr/config";
import { binaryImageFromRows } from "./test-helpers";

function wordFromComponents(components: Component[]): WordRegion {
  return { xStart: 0, xEnd: 100, yStart: 0, yEnd: 100, components };
}

/** Filas repetidas hasta alcanzar CHAR_MIN_HEIGHT, para que un componente pase el filtro sin fabricar su boundingBox. */
function repeatToMinHeight(row: string, count: number = OCR_CONFIG.CHAR_MIN_HEIGHT): string[] {
  return new Array(count).fill(row);
}

describe("extractCharactersFromWord", () => {
  it("produce un CharacterRegion por componente (1 componente = 1 carácter)", () => {
    const image = binaryImageFromRows(repeatToMinHeight("#.#"));
    const components = findConnectedComponents(image);
    expect(components).toHaveLength(2); // precondición: 2 trazos verticales aislados

    const chars = extractCharactersFromWord(wordFromComponents(components));
    expect(chars).toHaveLength(2);
  });

  it("aísla correctamente los píxeles de una forma en L (sin fugas de fondo)", () => {
    // Vertical de 9 filas en x=0, más un pie horizontal de 4 columnas en
    // la fila final -> altura real 10 (= CHAR_MIN_HEIGHT), sin fabricar
    // el boundingBox.
    const image = binaryImageFromRows([...repeatToMinHeight("#...", 9), "####"]);
    const components = findConnectedComponents(image);
    expect(components).toHaveLength(1);

    const [char] = extractCharactersFromWord(wordFromComponents(components));
    expect(char.width).toBe(4);
    expect(char.height).toBe(10);

    const R = (x: number, y: number) => char.pixels[(y * char.width + x) * 4];
    // filas 0-8: solo columna 0 blanca
    for (let y = 0; y < 9; y++) {
      expect(R(0, y)).toBe(255);
      expect(R(1, y)).toBe(0);
      expect(R(2, y)).toBe(0);
      expect(R(3, y)).toBe(0);
    }
    // fila 9 (el pie): las 4 columnas blancas
    expect(R(0, 9)).toBe(255);
    expect(R(1, 9)).toBe(255);
    expect(R(2, 9)).toBe(255);
    expect(R(3, 9)).toBe(255);
  });

  it("descarta componentes por debajo de CHAR_MIN_HEIGHT (ruido)", () => {
    const tooSmall: Component = {
      id: 0,
      pixels: [[0, 0]],
      boundingBox: { x: 0, y: 0, width: 1, height: OCR_CONFIG.CHAR_MIN_HEIGHT - 1 },
    };
    expect(extractCharactersFromWord(wordFromComponents([tooSmall]))).toHaveLength(0);
  });

  it("descarta componentes por encima de CHAR_MAX_HEIGHT (fallo de segmentación)", () => {
    const tooBig: Component = {
      id: 0,
      pixels: [[0, 0]],
      boundingBox: { x: 0, y: 0, width: 1, height: OCR_CONFIG.CHAR_MAX_HEIGHT + 1 },
    };
    expect(extractCharactersFromWord(wordFromComponents([tooBig]))).toHaveLength(0);
  });

  it("acepta un componente exactamente en los límites (inclusive)", () => {
    const atMin: Component = {
      id: 0,
      pixels: [[0, 0]],
      boundingBox: { x: 0, y: 0, width: 1, height: OCR_CONFIG.CHAR_MIN_HEIGHT },
    };
    const atMax: Component = {
      id: 1,
      pixels: [[0, 0]],
      boundingBox: { x: 5, y: 0, width: 1, height: OCR_CONFIG.CHAR_MAX_HEIGHT },
    };
    expect(extractCharactersFromWord(wordFromComponents([atMin, atMax]))).toHaveLength(2);
  });

  it("xStart/xEnd/yStart/yEnd reflejan el bounding box del componente", () => {
    const component: Component = {
      id: 0,
      pixels: [[10, 20]],
      boundingBox: { x: 10, y: 20, width: 5, height: 15 },
    };
    const [char] = extractCharactersFromWord(wordFromComponents([component]));
    expect(char).toMatchObject({ xStart: 10, xEnd: 14, yStart: 20, yEnd: 34, width: 5, height: 15 });
  });
});
