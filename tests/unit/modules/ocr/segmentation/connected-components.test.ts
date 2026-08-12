import { describe, expect, it } from "vitest";
import { findConnectedComponents } from "@/modules/ocr/segmentation/connected-components";
import { binaryImageFromRows } from "./test-helpers";

describe("findConnectedComponents", () => {
  it("encuentra dos regiones aisladas (4 píxeles y 9 píxeles)", () => {
    // 6x6 (no 5x5: un 2x2 y un 3x3 no caben separados por al menos 1 hueco
    // real en 5x5 sin quedar diagonalmente adyacentes bajo 8-conectividad
    // -- ver docs/ocr/algorithms.md). Distancia Chebyshev entre (1,1) y
    // (3,3) es 2, así que no se tocan ni siquiera en diagonal.
    const image = binaryImageFromRows([
      "##....",
      "##....",
      "......",
      "...###",
      "...###",
      "...###",
    ]);
    const components = findConnectedComponents(image);
    expect(components).toHaveLength(2);

    const sizes = components.map((c) => c.pixels.length).sort((a, b) => a - b);
    expect(sizes).toEqual([4, 9]);
  });

  it("8-conectividad: dos píxeles que solo se tocan en diagonal forman UN componente", () => {
    const image = binaryImageFromRows(["#.", ".#"]);
    const components = findConnectedComponents(image);
    expect(components).toHaveLength(1);
    expect(components[0].pixels).toHaveLength(2);
  });

  it("una imagen completamente negra no tiene componentes", () => {
    const image = binaryImageFromRows(["...", "...", "..."]);
    expect(findConnectedComponents(image)).toHaveLength(0);
  });

  it("una imagen completamente blanca es un único componente", () => {
    const image = binaryImageFromRows(["###", "###", "###"]);
    const components = findConnectedComponents(image);
    expect(components).toHaveLength(1);
    expect(components[0].pixels).toHaveLength(9);
    expect(components[0].boundingBox).toEqual({ x: 0, y: 0, width: 3, height: 3 });
  });

  it("calcula el bounding box correctamente para una forma en L", () => {
    // prettier-ignore
    const image = binaryImageFromRows([
      "#....",
      "#....",
      "#....",
      "####.",
    ]);
    const components = findConnectedComponents(image);
    expect(components).toHaveLength(1);
    expect(components[0].boundingBox).toEqual({ x: 0, y: 0, width: 4, height: 4 });
    // columna vertical (0,0),(0,1),(0,2) = 3 + fila horizontal
    // (0,3),(1,3),(2,3),(3,3) = 4, sin solape entre ambas -> 7 en total.
    expect(components[0].pixels).toHaveLength(7);
  });

  it("asigna ids distintos y correlativos a cada componente en orden de aparición", () => {
    const image = binaryImageFromRows(["#.#", "...", "#.."]);
    const components = findConnectedComponents(image);
    expect(components).toHaveLength(3);
    expect(components.map((c) => c.id)).toEqual([0, 1, 2]);
  });
});
