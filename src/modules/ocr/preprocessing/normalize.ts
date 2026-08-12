import { createImageData } from "@/modules/ocr/preprocessing/create-image-data";

/**
 * Reescala linealmente los valores de una imagen en escala de grises al
 * rango completo [0, 255]: `píxel' = ((píxel - min) / (max - min)) · 255`.
 * Una factura fotografiada con mala iluminación (muy oscura o muy clara)
 * ocupa solo una porción angosta del rango de contraste disponible; esto
 * la "estira" para usar todo el rango antes de binarizar, lo que hace que
 * Otsu (§ otsu-binarization.ts) tenga una separación más clara entre
 * texto y fondo.
 *
 * Espera una imagen ya convertida a escala de grises (R=G=B por píxel,
 * como devuelve `toGrayscale`); usa el canal R como valor de gris de
 * referencia para min/max — asume que R=G=B por construcción, no lo
 * revalida aquí (contrato de entrada, no un chequeo en runtime).
 */
export function normalizeRange(imageData: ImageData): ImageData {
  const { data, width, height } = imageData;

  let min = 255;
  let max = 0;
  for (let i = 0; i < data.length; i += 4) {
    const v = data[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }

  const output = new Uint8ClampedArray(data.length);

  // Imagen completamente uniforme: no hay rango que estirar sin dividir
  // por cero. Se copia tal cual.
  if (min === max) {
    output.set(data);
    return createImageData(output, width, height);
  }

  const range = max - min;
  for (let i = 0; i < data.length; i += 4) {
    const scaled = Math.round(((data[i] - min) / range) * 255);
    output[i] = scaled;
    output[i + 1] = scaled;
    output[i + 2] = scaled;
    output[i + 3] = data[i + 3];
  }

  return createImageData(output, width, height);
}
