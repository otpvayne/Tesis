import { describe, expect, it } from "vitest";
import { toGrayscale } from "@/modules/ocr/preprocessing/grayscale";
import { createImageData } from "@/modules/ocr/preprocessing/create-image-data";

describe("toGrayscale", () => {
  it("convierte rojo puro (255,0,0) a 76 según ITU-R BT.601", () => {
    const input = createImageData(Uint8ClampedArray.from([255, 0, 0, 255]), 1, 1);
    const result = toGrayscale(input);
    // 0.299*255 = 76.245 -> redondeado a 76
    expect(result.data[0]).toBe(76);
    expect(result.data[1]).toBe(76);
    expect(result.data[2]).toBe(76);
    expect(result.data[3]).toBe(255);
  });

  it("convierte verde puro (0,255,0) a 150 según ITU-R BT.601", () => {
    const input = createImageData(Uint8ClampedArray.from([0, 255, 0, 255]), 1, 1);
    const result = toGrayscale(input);
    // 0.587*255 = 149.685 -> redondeado a 150
    expect(result.data[0]).toBe(150);
  });

  it("convierte azul puro (0,0,255) a 29 según ITU-R BT.601", () => {
    const input = createImageData(Uint8ClampedArray.from([0, 0, 255, 255]), 1, 1);
    const result = toGrayscale(input);
    // 0.114*255 = 29.07 -> redondeado a 29
    expect(result.data[0]).toBe(29);
  });

  it("blanco puro se mantiene blanco (255)", () => {
    const input = createImageData(Uint8ClampedArray.from([255, 255, 255, 255]), 1, 1);
    expect(toGrayscale(input).data[0]).toBe(255);
  });

  it("negro puro se mantiene negro (0)", () => {
    const input = createImageData(Uint8ClampedArray.from([0, 0, 0, 255]), 1, 1);
    expect(toGrayscale(input).data[0]).toBe(0);
  });

  it("preserva el canal alfa original, incluso si no es 255", () => {
    const input = createImageData(Uint8ClampedArray.from([100, 100, 100, 128]), 1, 1);
    expect(toGrayscale(input).data[3]).toBe(128);
  });

  it("procesa múltiples píxeles en orden", () => {
    const input = createImageData(
      Uint8ClampedArray.from([255, 0, 0, 255, /**/ 0, 0, 0, 255]),
      2,
      1,
    );
    const result = toGrayscale(input);
    expect(result.data[0]).toBe(76); // primer píxel (rojo)
    expect(result.data[4]).toBe(0); // segundo píxel (negro)
  });

  it("conserva width y height", () => {
    const input = createImageData(new Uint8ClampedArray(3 * 2 * 4), 3, 2);
    const result = toGrayscale(input);
    expect(result.width).toBe(3);
    expect(result.height).toBe(2);
  });
});
