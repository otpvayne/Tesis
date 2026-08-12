import { OCR_CONFIG } from "@/modules/ocr/config";
import type { Component } from "@/modules/ocr/segmentation/connected-components";
import { computeProjections, type Projections } from "@/modules/ocr/segmentation/projections";

export interface LineRegion {
  yStart: number;
  yEnd: number;
  height: number;
  components: Component[];
}

/**
 * Agrupa componentes conectados en líneas de texto usando la proyección
 * horizontal: una fila con `horizontal[y] >= HORIZONTAL_VALLEY_THRESHOLD`
 * píxeles blancos se considera parte de una línea; por debajo de eso es un
 * "valle" (espacio entre líneas). Cada corrida contigua de filas de texto
 * es una `LineRegion`; a cada una se le asignan los componentes cuyo
 * bounding box se solapa (no solo toca un punto) con su rango `[yStart,
 * yEnd]` — un componente que cruza el límite de una línea (ej. una letra
 * con ascendente/descendente) sigue contando como parte de esa línea.
 */
export function extractLines(
  imageData: ImageData,
  components: Component[],
  projections?: Projections,
): LineRegion[] {
  const { horizontal } = projections ?? computeProjections(imageData);
  const threshold = OCR_CONFIG.HORIZONTAL_VALLEY_THRESHOLD;

  const ranges: Array<{ yStart: number; yEnd: number }> = [];
  let inLine = false;
  let start = 0;

  for (let y = 0; y < horizontal.length; y++) {
    const isTextRow = horizontal[y] >= threshold;
    if (isTextRow && !inLine) {
      inLine = true;
      start = y;
    } else if (!isTextRow && inLine) {
      inLine = false;
      ranges.push({ yStart: start, yEnd: y - 1 });
    }
  }
  if (inLine) {
    ranges.push({ yStart: start, yEnd: horizontal.length - 1 });
  }

  return ranges.map(({ yStart, yEnd }) => {
    const lineComponents = components.filter((component) => {
      const componentYStart = component.boundingBox.y;
      const componentYEnd = component.boundingBox.y + component.boundingBox.height - 1;
      return componentYStart <= yEnd && componentYEnd >= yStart;
    });

    return { yStart, yEnd, height: yEnd - yStart + 1, components: lineComponents };
  });
}
