export interface Projections {
  /** `horizontal[y]` = número de píxeles blancos en la fila `y`. Longitud = altura de la imagen. */
  horizontal: number[];
  /** `vertical[x]` = número de píxeles blancos en la columna `x`. Longitud = ancho de la imagen. */
  vertical: number[];
}

/**
 * Proyecciones horizontal y vertical de una imagen binaria: cuentan
 * píxeles blancos por fila y por columna. Se usan para encontrar "valles"
 * (filas/columnas con pocos píxeles blancos) que marcan los espacios entre
 * líneas de texto y entre palabras — ver `extract-lines.ts` y
 * `extract-words.ts`.
 */
export function computeProjections(imageData: ImageData): Projections {
  const { data, width, height } = imageData;
  const horizontal = new Array<number>(height).fill(0);
  const vertical = new Array<number>(width).fill(0);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4] === 255) {
        horizontal[y]++;
        vertical[x]++;
      }
    }
  }

  return { horizontal, vertical };
}
