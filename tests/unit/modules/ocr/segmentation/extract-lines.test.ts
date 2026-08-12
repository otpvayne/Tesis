import { describe, expect, it } from "vitest";
import { extractLines } from "@/modules/ocr/segmentation/extract-lines";
import { findConnectedComponents } from "@/modules/ocr/segmentation/connected-components";
import { computeProjections } from "@/modules/ocr/segmentation/projections";
import { binaryImageFromRows } from "./test-helpers";

// Dos "líneas de texto" (filas 0-2 y 5-7), cada una con 2 bloques de 5x3
// (10 píxeles blancos por fila, igual al HORIZONTAL_VALLEY_THRESHOLD por
// defecto de 10), separadas por 2 filas completamente negras (valle).
const TWO_LINES_IMAGE = binaryImageFromRows([
  "#####.#####...",
  "#####.#####...",
  "#####.#####...",
  "..............",
  "..............",
  "#####.#####...",
  "#####.#####...",
  "#####.#####...",
  "..............",
  "..............",
]);

describe("extractLines", () => {
  it("detecta exactamente 2 líneas separadas por un valle", () => {
    const components = findConnectedComponents(TWO_LINES_IMAGE);
    const lines = extractLines(TWO_LINES_IMAGE, components);
    expect(lines).toHaveLength(2);
  });

  it("cada línea tiene el rango Y correcto", () => {
    const components = findConnectedComponents(TWO_LINES_IMAGE);
    const [line1, line2] = extractLines(TWO_LINES_IMAGE, components);
    expect(line1).toMatchObject({ yStart: 0, yEnd: 2, height: 3 });
    expect(line2).toMatchObject({ yStart: 5, yEnd: 7, height: 3 });
  });

  it("cada línea recibe exactamente sus 2 componentes (no los de la otra línea)", () => {
    const components = findConnectedComponents(TWO_LINES_IMAGE);
    expect(components).toHaveLength(4); // 2 bloques x 2 líneas

    const [line1, line2] = extractLines(TWO_LINES_IMAGE, components);
    expect(line1.components).toHaveLength(2);
    expect(line2.components).toHaveLength(2);

    // los componentes de line1 están completamente en y=[0,2]; los de line2 en y=[5,7]
    for (const c of line1.components) {
      expect(c.boundingBox.y).toBeGreaterThanOrEqual(0);
      expect(c.boundingBox.y + c.boundingBox.height - 1).toBeLessThanOrEqual(2);
    }
    for (const c of line2.components) {
      expect(c.boundingBox.y).toBeGreaterThanOrEqual(5);
    }
  });

  it("una imagen sin texto (todo negro) no produce ninguna línea", () => {
    const image = binaryImageFromRows([".....", ".....", "....."]);
    const lines = extractLines(image, []);
    expect(lines).toHaveLength(0);
  });

  it("acepta proyecciones precomputadas y da el mismo resultado que calculándolas internamente", () => {
    const components = findConnectedComponents(TWO_LINES_IMAGE);
    const withoutProj = extractLines(TWO_LINES_IMAGE, components);
    const withProj = extractLines(TWO_LINES_IMAGE, components, computeProjections(TWO_LINES_IMAGE));
    expect(withProj).toEqual(withoutProj);
  });

  it("una única línea que ocupa toda la imagen (sin valle final) también se detecta", () => {
    const image = binaryImageFromRows(["##########", "##########", "##########"]);
    const components = findConnectedComponents(image);
    const lines = extractLines(image, components);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ yStart: 0, yEnd: 2, height: 3 });
  });
});
