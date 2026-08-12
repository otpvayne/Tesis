export interface ImageHistogram {
  /** 256 bins; `histogram[i]` = número de píxeles con valor de gris `i`. */
  histogram: number[];
  mean: number;
  stddev: number;
  median: number;
}

/**
 * Encuentra el valor en la posición ordenada `index` (0-indexada) de una
 * distribución representada como histograma, sin materializar el arreglo
 * ordenado completo (recorre los 256 bins acumulando conteo).
 */
function valueAtSortedIndex(histogram: number[], index: number): number {
  let cumulative = 0;
  for (let value = 0; value < histogram.length; value++) {
    cumulative += histogram[value];
    if (cumulative > index) return value;
  }
  return histogram.length - 1;
}

/**
 * Calcula el histograma de 256 bins de una imagen en escala de grises, más
 * media, desviación estándar y mediana. Sirve para decidir parámetros de
 * binarización (§ otsu-binarization.ts usa este histograma directamente en
 * vez de recorrer los píxeles de nuevo).
 *
 * La mediana se calcula sobre la distribución completa, no aproximada: para
 * `totalPixels` par, es el promedio de los dos valores centrales (posiciones
 * `totalPixels/2 - 1` y `totalPixels/2` en el arreglo ordenado) — la
 * definición estándar de mediana, no solo "el primer bin donde se cruza la
 * mitad del conteo acumulado" (que da un resultado distinto para N par).
 */
export function computeHistogram(imageData: ImageData): ImageHistogram {
  const { data } = imageData;
  const histogram = new Array<number>(256).fill(0);
  const totalPixels = data.length / 4;

  let sum = 0;
  for (let i = 0; i < data.length; i += 4) {
    const v = data[i];
    histogram[v]++;
    sum += v;
  }

  const mean = totalPixels > 0 ? sum / totalPixels : 0;

  let varianceSum = 0;
  for (let i = 0; i < data.length; i += 4) {
    varianceSum += (data[i] - mean) ** 2;
  }
  const stddev = totalPixels > 0 ? Math.sqrt(varianceSum / totalPixels) : 0;

  let median = 0;
  if (totalPixels > 0) {
    const midLow = Math.floor((totalPixels - 1) / 2);
    const midHigh = Math.floor(totalPixels / 2);
    median = (valueAtSortedIndex(histogram, midLow) + valueAtSortedIndex(histogram, midHigh)) / 2;
  }

  return { histogram, mean, stddev, median };
}
