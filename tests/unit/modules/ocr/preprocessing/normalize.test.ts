import { describe, expect, it } from "vitest";
import { normalizeRange } from "@/modules/ocr/preprocessing/normalize";
import { createImageData } from "@/modules/ocr/preprocessing/create-image-data";

function grayPixel(v: number): number[] {
  return [v, v, v, 255];
}

describe("normalizeRange", () => {
  it("reescala el rango [50, 200] a [0, 255]", () => {
    const input = createImageData(
      Uint8ClampedArray.from([...grayPixel(50), ...grayPixel(200)]),
      2,
      1,
    );
    const result = normalizeRange(input);
    expect(result.data[0]).toBe(0); // (50-50)/(200-50)*255 = 0
    expect(result.data[4]).toBe(255); // (200-50)/(200-50)*255 = 255
  });

  it("un valor intermedio se reescala proporcionalmente", () => {
    // min=50, max=200, valor=125 -> (125-50)/150*255 = 127.5 -> redondeado 128
    const input = createImageData(
      Uint8ClampedArray.from([...grayPixel(50), ...grayPixel(125), ...grayPixel(200)]),
      3,
      1,
    );
    const result = normalizeRange(input);
    expect(result.data[4]).toBe(128);
  });

  it("no cambia una imagen que ya usa el rango completo [0, 255]", () => {
    const input = createImageData(
      Uint8ClampedArray.from([...grayPixel(0), ...grayPixel(255)]),
      2,
      1,
    );
    const result = normalizeRange(input);
    expect(result.data[0]).toBe(0);
    expect(result.data[4]).toBe(255);
  });

  it("una imagen completamente uniforme se deja intacta (evita división por cero)", () => {
    const input = createImageData(
      Uint8ClampedArray.from([...grayPixel(100), ...grayPixel(100)]),
      2,
      1,
    );
    const result = normalizeRange(input);
    expect(result.data[0]).toBe(100);
    expect(result.data[4]).toBe(100);
  });

  it("preserva el canal alfa", () => {
    const input = createImageData(Uint8ClampedArray.from([50, 50, 50, 128]), 1, 1);
    expect(normalizeRange(input).data[3]).toBe(128);
  });

  it("conserva width y height", () => {
    const input = createImageData(new Uint8ClampedArray(2 * 3 * 4), 2, 3);
    const result = normalizeRange(input);
    expect(result.width).toBe(2);
    expect(result.height).toBe(3);
  });
});
