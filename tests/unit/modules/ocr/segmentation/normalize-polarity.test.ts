import { describe, expect, it } from "vitest";
import { ensureTextIsForeground } from "@/modules/ocr/segmentation/normalize-polarity";
import { binaryImageFromRows } from "./test-helpers";

describe("ensureTextIsForeground", () => {
  it("invierte cuando el blanco (255) es mayoritario -- caso factura real: papel claro, texto oscuro", () => {
    // 3x3: 8 píxeles blancos (papel) + 1 negro (una mota de "texto")
    const image = binaryImageFromRows(["###", "#.#", "###"]);
    const result = ensureTextIsForeground(image);
    // tras invertir: el que era negro (centro) ahora es blanco, y viceversa
    const R = (x: number, y: number) => result.data[(y * 3 + x) * 4];
    expect(R(1, 1)).toBe(255); // el "texto" ahora es foreground
    expect(R(0, 0)).toBe(0); // el "papel" ahora es background
  });

  it("no invierte cuando el blanco ya es minoritario (ya representa el texto)", () => {
    const image = binaryImageFromRows(["...", ".#.", "..."]);
    const result = ensureTextIsForeground(image);
    const R = (x: number, y: number) => result.data[(y * 3 + x) * 4];
    expect(R(1, 1)).toBe(255); // sigue siendo blanco, sin cambios
    expect(R(0, 0)).toBe(0);
  });

  it("con exactamente 50/50 no invierte (el blanco no es mayoría estricta)", () => {
    const image = binaryImageFromRows(["##", ".."]);
    const result = ensureTextIsForeground(image);
    const R = (x: number, y: number) => result.data[(y * 2 + x) * 4];
    expect(R(0, 0)).toBe(255);
    expect(R(0, 1)).toBe(0);
  });

  it("preserva el canal alfa al invertir", () => {
    const image = binaryImageFromRows(["###", "###", "..#"]);
    const before = image.data[3];
    const result = ensureTextIsForeground(image);
    expect(result.data[3]).toBe(before);
  });

  it("conserva width y height", () => {
    const image = binaryImageFromRows(["#####", "....."]);
    const result = ensureTextIsForeground(image);
    expect(result.width).toBe(5);
    expect(result.height).toBe(2);
  });
});
