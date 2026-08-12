import { createImageData } from "@/modules/ocr/preprocessing/create-image-data";
import { computeHistogram, type ImageHistogram } from "@/modules/ocr/preprocessing/histogram";

/**
 * Calcula el threshold óptimo de Otsu, implementado desde cero (ver
 * `CLAUDE.md` §7 — prohibido importar una implementación de terceros).
 * Fórmula completa y ejemplo numérico en `docs/ocr/algorithms.md`.
 *
 * Para cada threshold candidato `t` (0-255), separa los píxeles en clase 0
 * (`valor < t`) y clase 1 (`valor >= t`), y calcula la varianza entre
 * clases `σ²(t) = w0(t)·w1(t)·(μ0(t) - μ1(t))²`. El threshold elegido es
 * el que maximiza esa varianza — el punto donde ambas clases están más
 * separadas entre sí.
 *
 * Recorrido en una sola pasada O(256) con sumas acumuladas (`w0`, `sum0`),
 * no recalculando desde cero para cada `t` — evita el O(256²) de la
 * versión ingenua del pseudocódigo. Exportado por separado de
 * `otsuBinarization` para poder probarlo (y mostrarlo en el OCR Lab
 * preview) sin depender de inspeccionar píxeles de salida.
 */
export function computeOtsuThreshold(imageData: ImageData, histogram?: ImageHistogram): number {
  const { width, height } = imageData;
  const hist = histogram ?? computeHistogram(imageData);
  const totalPixels = width * height;
  const p = hist.histogram.map((count) => count / totalPixels);
  const totalSum = p.reduce((acc, pi, i) => acc + i * pi, 0);

  // varianceAt[t] = varianza entre clases si el threshold fuera t; -1
  // donde no hay un split válido (una de las dos clases está vacía).
  const varianceAt = new Array<number>(256).fill(-1);

  let w0 = 0;
  let sum0 = 0;
  for (let t = 0; t <= 255; t++) {
    const w1 = 1 - w0;
    if (w0 > 0 && w1 > 0) {
      const mu0 = sum0 / w0;
      const mu1 = (totalSum - sum0) / w1;
      varianceAt[t] = w0 * w1 * (mu0 - mu1) ** 2;
    }
    // Prepara la clase 0 para el siguiente threshold (t+1 incluye el
    // valor t en su clase 0: "< t+1" equivale a "<= t").
    w0 += p[t];
    sum0 += t * p[t];
  }

  const maxVariance = Math.max(...varianceAt);

  if (maxVariance <= 0) {
    // Imagen completamente uniforme (o casi): ningún threshold separa dos
    // clases no vacías. No existe un umbral "correcto" — 128 es un valor
    // neutral que no favorece a ningún lado.
    return 128;
  }

  // En histogramas fuertemente bimodales (dos picos aislados, sin masa
  // entre ellos) varios thresholds consecutivos empatan en la varianza
  // máxima — cualquiera separa las clases igual de bien. Se usa el punto
  // medio del rango empatado en vez del primero, un umbral más
  // representativo que un extremo arbitrario del empate.
  const tied = varianceAt.map((v, t) => (v === maxVariance ? t : -1)).filter((t) => t !== -1);
  return Math.round((tied[0] + tied[tied.length - 1]) / 2);
}

/**
 * Binariza una imagen en escala de grises usando el threshold de Otsu:
 * `píxel' = píxel >= threshold ? 255 : 0`.
 */
export function otsuBinarization(imageData: ImageData, histogram?: ImageHistogram): ImageData {
  const { data, width, height } = imageData;
  const threshold = computeOtsuThreshold(imageData, histogram);

  const output = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const value = data[i] >= threshold ? 255 : 0;
    output[i] = value;
    output[i + 1] = value;
    output[i + 2] = value;
    output[i + 3] = data[i + 3];
  }

  return createImageData(output, width, height);
}
