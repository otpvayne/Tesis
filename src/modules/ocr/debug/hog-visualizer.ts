import type { HOGConfig } from "@/modules/ocr/classification/hog-extractor";

/**
 * Tamaño en píxeles de cada celda de la grilla al dibujar el descriptor —
 * puramente de presentación (el HOG real se calcula sobre el carácter
 * normalizado de `OCR_CONFIG.CHAR_SIZE`, 32×32 por defecto; eso sería
 * ilegible a simple vista, así que esta visualización se dibuja en su
 * propia escala fija, sin relación con el tamaño real del carácter).
 */
const DEFAULT_CELL_PIXELS = 24;

/**
 * Visualización clásica de un descriptor HOG (`extractHOG`,
 * `classification/hog-extractor.ts`): un segmento de línea por cada bin de
 * orientación de cada región de la grilla, centrado en la celda,
 * orientado al ángulo medio del bin y con longitud proporcional a su valor
 * normalizado — el patrón estándar en la literatura de HOG para "ver" qué
 * orientaciones domina cada zona del carácter (ej. un trazo vertical fuerte
 * en la región izquierda de una "1").
 *
 * El segmento se dibuja **de doble punta** (cruzando el centro en ambas
 * direcciones) porque el gradiente que produce `extractHOG` es "sin signo"
 * (plegado a `[0°, 180°)`, ver su propio comentario): una orientación de
 * 30° y una de 210° son el mismo trazo, así que no hay una "punta de
 * flecha" con sentido que dibujar, solo una línea.
 *
 * Genera SVG (no PNG/canvas) a propósito: es una función pura de
 * `Float32Array`/`HOGConfig` → `string`, testeable sin `node-canvas` ni
 * ningún entorno gráfico real — mismo criterio de testabilidad que el
 * resto de `modules/ocr` (`docs/testing/test-plan.md`).
 */
export function hogDescriptorToSvg(
  descriptor: Float32Array | number[],
  config: HOGConfig,
  cellPixels: number = DEFAULT_CELL_PIXELS,
): string {
  const { gridCols, gridRows, orientationBins } = config;
  const expectedLength = gridCols * gridRows * orientationBins;
  if (descriptor.length !== expectedLength) {
    throw new Error(
      `hogDescriptorToSvg: el descriptor tiene ${descriptor.length} valores, se esperaban ${expectedLength} (gridCols=${gridCols} × gridRows=${gridRows} × orientationBins=${orientationBins}).`,
    );
  }

  const width = gridCols * cellPixels;
  const height = gridRows * cellPixels;
  const binWidth = 180 / orientationBins;
  const maxRadius = cellPixels / 2;

  const gridLines: string[] = [];
  for (let col = 0; col <= gridCols; col++) {
    const x = col * cellPixels;
    gridLines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${height}" stroke="#e2e8f0" stroke-width="1" />`);
  }
  for (let row = 0; row <= gridRows; row++) {
    const y = row * cellPixels;
    gridLines.push(`<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="#e2e8f0" stroke-width="1" />`);
  }

  const orientationLines: string[] = [];
  for (let regionRow = 0; regionRow < gridRows; regionRow++) {
    for (let regionCol = 0; regionCol < gridCols; regionCol++) {
      const cx = regionCol * cellPixels + cellPixels / 2;
      const cy = regionRow * cellPixels + cellPixels / 2;
      const regionOffset = (regionRow * gridCols + regionCol) * orientationBins;

      for (let bin = 0; bin < orientationBins; bin++) {
        const value = descriptor[regionOffset + bin];
        if (value <= 0) continue;

        // Ángulo medio del bin, convertido a radianes. Los ejes de SVG
        // crecen hacia abajo (y positivo = abajo), por eso se usa -angle
        // al proyectar: mantiene la orientación visual coherente con
        // cómo se ve el carácter (0° = horizontal, 90° = vertical),
        // independiente de esa inversión del eje y.
        const angleDeg = bin * binWidth + binWidth / 2;
        const angleRad = (angleDeg * Math.PI) / 180;
        const radius = Math.min(1, value) * maxRadius;
        const dx = Math.cos(angleRad) * radius;
        const dy = -Math.sin(angleRad) * radius;

        const opacity = Math.min(1, value).toFixed(3);
        orientationLines.push(
          `<line x1="${(cx - dx).toFixed(2)}" y1="${(cy - dy).toFixed(2)}" x2="${(cx + dx).toFixed(2)}" y2="${(cy + dy).toFixed(2)}" stroke="#1d4ed8" stroke-width="1.5" stroke-linecap="round" opacity="${opacity}" />`,
        );
      }
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect x="0" y="0" width="${width}" height="${height}" fill="#0f172a" />`,
    ...gridLines,
    ...orientationLines,
    `</svg>`,
  ].join("");
}
