import { OCR_CONFIG } from "@/modules/ocr/config";

/**
 * Configuración de la grilla espacial de `extractHOG`. Ver
 * `docs/ocr/algorithms.md` §12 y el comentario de `OCR_CONFIG.HOG_GRID_COLS`
 * (`modules/ocr/config.ts`) para la razón por la que se usa una grilla
 * directa de `gridCols × gridRows` regiones en vez del esquema clásico de
 * celdas + bloques con solape.
 */
export interface HOGConfig {
  gridCols: number;
  gridRows: number;
  orientationBins: number;
}

const DEFAULT_HOG_CONFIG: HOGConfig = {
  gridCols: OCR_CONFIG.HOG_GRID_COLS,
  gridRows: OCR_CONFIG.HOG_GRID_ROWS,
  orientationBins: OCR_CONFIG.HOG_ORIENTATION_BINS,
};

/**
 * Gradiente por diferencia central en un píxel `(x, y)` del canal de
 * intensidad (`data[i]`, funciona igual para escala de grises o binario
 * 0/255 — HOG no requiere que la entrada sea binaria).
 *
 * ```
 * Gx(x, y) = I(x+1, y) - I(x-1, y)
 * Gy(x, y) = I(x, y+1) - I(x, y-1)
 * magnitud(x, y)  = √(Gx² + Gy²)
 * orientación(x, y) = atan2(Gy, Gx), plegado a [0°, 180°)
 * ```
 *
 * El plegado a `[0, 180)` (sumar 180° si el ángulo es negativo) hace el
 * gradiente "sin signo": un trazo no tiene un lado "positivo" — una línea
 * a 10° y su opuesta a 190° son el mismo trazo, así que deben caer en el
 * mismo bin.
 *
 * Bordes de la imagen: igual que `denoise.ts`/`gaussian-blur.ts`, se
 * usa replicación (el vecino fuera de límite repite el píxel de borde),
 * no padding de ceros — un padding de ceros inventaría un borde oscuro
 * falso alrededor de cualquier carácter, contaminando su gradiente real.
 */
function computeGradient(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
): { magnitude: number; angle: number } {
  const leftX = Math.max(0, x - 1);
  const rightX = Math.min(width - 1, x + 1);
  const upY = Math.max(0, y - 1);
  const downY = Math.min(height - 1, y + 1);

  const left = data[(y * width + leftX) * 4];
  const right = data[(y * width + rightX) * 4];
  const up = data[(upY * width + x) * 4];
  const down = data[(downY * width + x) * 4];

  const gx = right - left;
  const gy = down - up;
  const magnitude = Math.sqrt(gx * gx + gy * gy);

  let angle = (Math.atan2(gy, gx) * 180) / Math.PI;
  if (angle < 0) angle += 180;

  return { magnitude, angle };
}

/**
 * HOG (Histogram of Oriented Gradients) propio (`CLAUDE.md` §7 — algoritmo
 * conocido, implementado desde su definición matemática, no una librería de
 * terceros).
 *
 * La imagen se divide en una grilla de `gridCols × gridRows` regiones
 * (límites por `Math.floor(i·dimensión/divisiones)`, deterministas — no
 * necesariamente todas del mismo tamaño en píxeles si la dimensión no es
 * múltiplo exacto de las divisiones, ver `docs/ocr/algorithms.md` §12).
 * Para cada región:
 *
 * 1. Cada píxel vota en el bin de orientación más cercano
 *    (`round(ángulo / (180/orientationBins)) % orientationBins`),
 *    ponderado por su magnitud de gradiente (sin interpolación bilineal
 *    entre bins adyacentes — votación simple al bin más cercano).
 * 2. El histograma de la región (`orientationBins` valores) se normaliza
 *    L2: `normalizado = histograma / (‖histograma‖₂ + epsilon)`.
 *
 * El descriptor final es la concatenación de las `gridCols × gridRows`
 * regiones, en orden fila por fila — longitud total
 * `gridCols × gridRows × orientationBins` (108 con los valores por
 * defecto de `OCR_CONFIG`).
 */
export function extractHOG(imageData: ImageData, config: HOGConfig = DEFAULT_HOG_CONFIG): Float32Array {
  const { data, width, height } = imageData;
  const { gridCols, gridRows, orientationBins } = config;
  const epsilon = OCR_CONFIG.HOG_EPSILON;
  const binWidth = 180 / orientationBins;

  const colBoundaries = Array.from({ length: gridCols + 1 }, (_, i) => Math.floor((i * width) / gridCols));
  const rowBoundaries = Array.from({ length: gridRows + 1 }, (_, i) => Math.floor((i * height) / gridRows));

  const descriptor = new Float32Array(gridCols * gridRows * orientationBins);

  for (let regionRow = 0; regionRow < gridRows; regionRow++) {
    for (let regionCol = 0; regionCol < gridCols; regionCol++) {
      const histogram = new Float32Array(orientationBins);

      for (let y = rowBoundaries[regionRow]; y < rowBoundaries[regionRow + 1]; y++) {
        for (let x = colBoundaries[regionCol]; x < colBoundaries[regionCol + 1]; x++) {
          const { magnitude, angle } = computeGradient(data, width, height, x, y);
          const binIndex = Math.round(angle / binWidth) % orientationBins;
          histogram[binIndex] += magnitude;
        }
      }

      let normSquared = 0;
      for (let i = 0; i < orientationBins; i++) normSquared += histogram[i] * histogram[i];
      const norm = Math.sqrt(normSquared);

      const regionOffset = (regionRow * gridCols + regionCol) * orientationBins;
      for (let i = 0; i < orientationBins; i++) {
        descriptor[regionOffset + i] = histogram[i] / (norm + epsilon);
      }
    }
  }

  return descriptor;
}
