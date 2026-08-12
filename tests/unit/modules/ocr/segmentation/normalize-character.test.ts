import { describe, expect, it } from "vitest";
import { normalizeCharacter } from "@/modules/ocr/segmentation/normalize-character";
import type { CharacterRegion } from "@/modules/ocr/segmentation/extract-characters";
import type { Component } from "@/modules/ocr/segmentation/connected-components";

const DUMMY_COMPONENT: Component = { id: 0, pixels: [], boundingBox: { x: 0, y: 0, width: 1, height: 1 } };

function makeCharRegion(width: number, height: number, pixels: Uint8ClampedArray): CharacterRegion {
  return {
    component: DUMMY_COMPONENT,
    xStart: 0,
    xEnd: width - 1,
    yStart: 0,
    yEnd: height - 1,
    width,
    height,
    pixels,
  };
}

function solidPixels(width: number, height: number, value: number): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    pixels[i * 4] = value;
    pixels[i * 4 + 1] = value;
    pixels[i * 4 + 2] = value;
    pixels[i * 4 + 3] = 255;
  }
  return pixels;
}

describe("normalizeCharacter", () => {
  it("preserva el aspect ratio de un carácter 10×20 al normalizar a 32×32", () => {
    // ratio = 10/20 = 0.5 -> newHeight=32, newWidth=round(32*0.5)=16
    const char = makeCharRegion(10, 20, solidPixels(10, 20, 255));
    const result = normalizeCharacter(char, 32);
    expect(result.width).toBe(32);
    expect(result.height).toBe(32);

    // el contenido ocupa 16 columnas centradas: offsetX=(32-16)/2=8..23
    const R = (x: number, y: number) => result.data[(y * 32 + x) * 4];
    expect(R(7, 16)).toBe(0); // fuera del contenido (padding izquierdo)
    expect(R(8, 16)).toBe(255); // borde izquierdo del contenido
    expect(R(23, 16)).toBe(255); // borde derecho del contenido
    expect(R(24, 16)).toBe(0); // fuera del contenido (padding derecho)
  });

  it("un carácter cuadrado no necesita padding (llena todo el lienzo)", () => {
    const char = makeCharRegion(5, 5, solidPixels(5, 5, 255));
    const result = normalizeCharacter(char, 10);
    for (let i = 0; i < result.data.length; i += 4) {
      expect(result.data[i]).toBe(255);
    }
  });

  it("caso calculable a mano: 1×2 (mitad blanca, mitad negra) normalizado a 4×4", () => {
    // pixel superior blanco, inferior negro
    const pixels = new Uint8ClampedArray(1 * 2 * 4);
    pixels.set([255, 255, 255, 255], 0);
    pixels.set([0, 0, 0, 255], 4);
    const char = makeCharRegion(1, 2, pixels);

    // ratio=0.5 -> newHeight=4, newWidth=round(4*0.5)=2 -> offsetX=1, offsetY=0
    const result = normalizeCharacter(char, 4);
    const R = (x: number, y: number) => result.data[(y * 4 + x) * 4];

    // columnas 0 y 3 son padding (negro) en todas las filas
    for (let y = 0; y < 4; y++) {
      expect(R(0, y)).toBe(0);
      expect(R(3, y)).toBe(0);
    }
    // filas 0-1 del contenido (columnas 1-2) = blanco (mitad superior original)
    expect(R(1, 0)).toBe(255);
    expect(R(2, 0)).toBe(255);
    expect(R(1, 1)).toBe(255);
    expect(R(2, 1)).toBe(255);
    // filas 2-3 del contenido = negro (mitad inferior original)
    expect(R(1, 2)).toBe(0);
    expect(R(2, 2)).toBe(0);
    expect(R(1, 3)).toBe(0);
    expect(R(2, 3)).toBe(0);
  });

  it("usa CHAR_SIZE de OCR_CONFIG como tamaño por defecto (32)", () => {
    const char = makeCharRegion(5, 5, solidPixels(5, 5, 255));
    const result = normalizeCharacter(char);
    expect(result.width).toBe(32);
    expect(result.height).toBe(32);
  });

  it("no revienta con un carácter de 1×1 píxel", () => {
    const char = makeCharRegion(1, 1, solidPixels(1, 1, 255));
    const result = normalizeCharacter(char, 8);
    expect(result.width).toBe(8);
    expect(result.height).toBe(8);
  });
});
