import { createImageData } from "@/modules/ocr/preprocessing/create-image-data";

/**
 * Reduce ruido "sal y pimienta" (píxeles aislados) con un filtro de
 * mediana: cada píxel se reemplaza por la mediana de sus vecinos en un
 * kernel `kernelSize × kernelSize` (3×3 por defecto).
 *
 * Se elige mediana en vez de un filtro Gaussiano (que promedia) porque
 * esta etapa trabaja sobre imágenes **binarias** (solo 0 o 255, salida de
 * `otsuBinarization`): un promedio produciría valores grises intermedios
 * que ya no son 0/255, rompiendo la propiedad binaria que necesita la
 * segmentación (Fase 4b). La mediana, en cambio, siempre devuelve uno de
 * los valores efectivamente presentes en la vecindad — si la vecindad es
 * binaria, la salida sigue siendo binaria — y por votación de mayoría
 * elimina un píxel aislado que difiere del resto sin difuminar bordes.
 *
 * Bordes de la imagen: se resuelven por replicación (el vecino fuera de
 * los límites toma el valor del píxel de borde más cercano) — no hay
 * franja de padding artificial que pudiera introducir ruido falso.
 *
 * **Limitación conocida (Fase 4b):** la mediana "vota por mayoría" en toda
 * la vecindad, no solo contra ruido aislado. Un trazo de 1px de ancho
 * (letra pequeña, serif) donde la mayoría de los 9 vecinos son fondo
 * también pierde la votación y se borra — el filtro no distingue "píxel
 * de ruido aislado" de "trazo delgado real". Por eso `OCR_CONFIG.APPLY_DENOISE`
 * está en `false` por defecto hasta calibrar un kernel o técnica
 * (ej. mediana condicionada al tamaño del trazo, o apertura morfológica)
 * que no erosione texto pequeño real.
 */
export function denoise(imageData: ImageData, kernelSize: number = 3): ImageData {
  const { data, width, height } = imageData;
  const output = new Uint8ClampedArray(data.length);
  const half = Math.floor(kernelSize / 2);
  const neighbors = new Array<number>(kernelSize * kernelSize);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let n = 0;
      for (let dy = -half; dy <= half; dy++) {
        const ny = Math.min(height - 1, Math.max(0, y + dy));
        for (let dx = -half; dx <= half; dx++) {
          const nx = Math.min(width - 1, Math.max(0, x + dx));
          neighbors[n++] = data[(ny * width + nx) * 4];
        }
      }
      neighbors.sort((a, b) => a - b);
      const median = neighbors[Math.floor(neighbors.length / 2)];

      const outIdx = (y * width + x) * 4;
      output[outIdx] = median;
      output[outIdx + 1] = median;
      output[outIdx + 2] = median;
      output[outIdx + 3] = data[outIdx + 3];
    }
  }

  return createImageData(output, width, height);
}
