import { describe, expect, it } from "vitest";
import { extractWordsFromLine } from "@/modules/ocr/segmentation/extract-words";
import { findConnectedComponents } from "@/modules/ocr/segmentation/connected-components";
import type { LineRegion } from "@/modules/ocr/segmentation/extract-lines";
import { binaryImageFromRows } from "./test-helpers";

function lineFromImage(image: ImageData): LineRegion {
  const components = findConnectedComponents(image);
  return { yStart: 0, yEnd: image.height - 1, height: image.height, components };
}

describe("extractWordsFromLine", () => {
  it("separa 3 palabras por espacios (3 columnas de hueco entre cada una)", () => {
    const image = binaryImageFromRows([
      "###...###...###.....",
      "###...###...###.....",
      "###...###...###.....",
    ]);
    const line = lineFromImage(image);
    const words = extractWordsFromLine(line);
    expect(words).toHaveLength(3);
    expect(words[0]).toMatchObject({ xStart: 0, xEnd: 2 });
    expect(words[1]).toMatchObject({ xStart: 6, xEnd: 8 });
    expect(words[2]).toMatchObject({ xStart: 12, xEnd: 14 });
  });

  it("cada palabra conserva el yStart/yEnd de la línea original", () => {
    const image = binaryImageFromRows(["###...###", "###...###", "###...###"]);
    const line: LineRegion = { yStart: 5, yEnd: 7, height: 3, components: findConnectedComponents(image) };
    const words = extractWordsFromLine(line);
    for (const word of words) {
      expect(word.yStart).toBe(5);
      expect(word.yEnd).toBe(7);
    }
  });

  it("una sola palabra sin espacios internos da un único WordRegion", () => {
    const image = binaryImageFromRows(["#####", "#####", "#####"]);
    const words = extractWordsFromLine(lineFromImage(image));
    expect(words).toHaveLength(1);
    expect(words[0]).toMatchObject({ xStart: 0, xEnd: 4 });
  });

  it("una línea sin componentes no produce ninguna palabra", () => {
    const words = extractWordsFromLine({ yStart: 0, yEnd: 2, height: 3, components: [] });
    expect(words).toHaveLength(0);
  });

  it("cada WordRegion solo incluye los componentes dentro de su rango X", () => {
    const image = binaryImageFromRows(["###...###", "###...###", "###...###"]);
    const words = extractWordsFromLine(lineFromImage(image));
    expect(words).toHaveLength(2);
    expect(words[0].components).toHaveLength(1);
    expect(words[1].components).toHaveLength(1);
    expect(words[0].components[0].boundingBox.x).toBe(0);
    expect(words[1].components[0].boundingBox.x).toBe(6);
  });
});
