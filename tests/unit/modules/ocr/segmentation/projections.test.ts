import { describe, expect, it } from "vitest";
import { computeProjections } from "@/modules/ocr/segmentation/projections";
import { binaryImageFromRows } from "./test-helpers";

describe("computeProjections", () => {
  it("imagen 3×3 con una línea horizontal blanca en la fila 1", () => {
    const image = binaryImageFromRows(["...", "###", "..."]);
    const { horizontal, vertical } = computeProjections(image);
    expect(horizontal).toEqual([0, 3, 0]);
    expect(vertical).toEqual([1, 1, 1]);
  });

  it("imagen 3×3 con una columna vertical blanca en la columna 1", () => {
    const image = binaryImageFromRows([".#.", ".#.", ".#."]);
    const { horizontal, vertical } = computeProjections(image);
    expect(horizontal).toEqual([1, 1, 1]);
    expect(vertical).toEqual([0, 3, 0]);
  });

  it("imagen completamente negra: ambas proyecciones son todo ceros", () => {
    const image = binaryImageFromRows(["..", ".."]);
    const { horizontal, vertical } = computeProjections(image);
    expect(horizontal).toEqual([0, 0]);
    expect(vertical).toEqual([0, 0]);
  });

  it("patrón diagonal: cada fila y columna tiene exactamente 1 píxel blanco", () => {
    const image = binaryImageFromRows(["#..", ".#.", "..#"]);
    const { horizontal, vertical } = computeProjections(image);
    expect(horizontal).toEqual([1, 1, 1]);
    expect(vertical).toEqual([1, 1, 1]);
  });

  it("las longitudes de los arrays coinciden con height y width", () => {
    const image = binaryImageFromRows(["....", "....", "...."]);
    const { horizontal, vertical } = computeProjections(image);
    expect(horizontal).toHaveLength(3);
    expect(vertical).toHaveLength(4);
  });
});
