import { OCR_CONFIG } from "@/modules/ocr/config";
import type { Component } from "@/modules/ocr/segmentation/connected-components";
import type { LineRegion } from "@/modules/ocr/segmentation/extract-lines";

export interface WordRegion {
  xStart: number;
  xEnd: number;
  yStart: number;
  yEnd: number;
  components: Component[];
}

/**
 * Agrupa los componentes de una línea en palabras, usando una proyección
 * vertical calculada **solo a partir de los píxeles de esa línea** (no de
 * la imagen completa) — por eso la firma recibe únicamente el
 * `LineRegion`, no `ImageData`: cada `Component` ya trae sus propios
 * píxeles (`component.pixels`), así que la proyección se arma sumando
 * directamente sobre esos puntos con un `Map<x, conteo>` disperso, sin
 * necesitar el ancho de la imagen ni volver a tocar el canvas original.
 *
 * Umbral de valle: `VERTICAL_VALLEY_THRESHOLD` (más bajo que el horizontal
 * de `extract-lines.ts` a propósito — ver `modules/ocr/config.ts`, el
 * espacio entre letras de una misma palabra también genera columnas con
 * pocos píxeles y no debe confundirse con espacio entre palabras).
 */
export function extractWordsFromLine(line: LineRegion): WordRegion[] {
  if (line.components.length === 0) return [];

  const columnCounts = new Map<number, number>();
  let minX = Infinity;
  let maxX = -Infinity;

  for (const component of line.components) {
    for (const [x] of component.pixels) {
      columnCounts.set(x, (columnCounts.get(x) ?? 0) + 1);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
    }
  }

  const threshold = OCR_CONFIG.VERTICAL_VALLEY_THRESHOLD;
  const ranges: Array<{ xStart: number; xEnd: number }> = [];
  let inWord = false;
  let start = minX;

  for (let x = minX; x <= maxX; x++) {
    const isTextColumn = (columnCounts.get(x) ?? 0) >= threshold;
    if (isTextColumn && !inWord) {
      inWord = true;
      start = x;
    } else if (!isTextColumn && inWord) {
      inWord = false;
      ranges.push({ xStart: start, xEnd: x - 1 });
    }
  }
  if (inWord) {
    ranges.push({ xStart: start, xEnd: maxX });
  }

  return ranges.map(({ xStart, xEnd }) => {
    const wordComponents = line.components.filter((component) => {
      const componentXStart = component.boundingBox.x;
      const componentXEnd = component.boundingBox.x + component.boundingBox.width - 1;
      return componentXStart <= xEnd && componentXEnd >= xStart;
    });

    return { xStart, xEnd, yStart: line.yStart, yEnd: line.yEnd, components: wordComponents };
  });
}
