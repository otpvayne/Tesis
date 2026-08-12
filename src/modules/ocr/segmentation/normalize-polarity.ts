import { createImageData } from "@/modules/ocr/preprocessing/create-image-data";

/**
 * `findConnectedComponents` (y todo lo que sigue en Fase 4b) asume que el
 * primer plano a segmentar — el texto — es el valor `255` (blanco).
 * `otsuBinarization` (Fase 4a) no hace esa suposición: solo separa la
 * imagen en dos clases por luminancia, sin saber cuál de las dos
 * "significa" texto. En una factura real (papel claro, tinta oscura), el
 * texto termina siendo la clase más **oscura** — tras Otsu queda en `0`
 * (negro), no en `255`. Sin este paso, `findConnectedComponents`
 * "encontraría" el papel en blanco como si fuera el contenido a
 * segmentar, y el texto real quedaría invisible (los huecos negros).
 *
 * Heurística: se asume que el texto es la clase **minoritaria** de
 * píxeles — la tinta cubre menos área que el papel en un documento
 * típico. Si la clase blanca (255) resulta ser la mayoritaria, se invierte
 * toda la imagen para que el texto (minoritario) quede en 255.
 *
 * Debe correr justo después de `otsuBinarization` (Fase 4a) y antes de
 * `findConnectedComponents` (Fase 4b) — encontrado al diseñar el test de
 * integración de esta fase, no estaba cubierto por los tests unitarios de
 * cada función por separado (cada una asumía que la entrada ya tenía la
 * polaridad correcta).
 */
export function ensureTextIsForeground(imageData: ImageData): ImageData {
  const { data, width, height } = imageData;
  const totalPixels = width * height;

  let whiteCount = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] === 255) whiteCount++;
  }

  const whiteIsMajority = whiteCount > totalPixels / 2;
  if (!whiteIsMajority) {
    return imageData;
  }

  const output = new Uint8ClampedArray(data.length);
  for (let i = 0; i < data.length; i += 4) {
    const inverted = data[i] === 255 ? 0 : 255;
    output[i] = inverted;
    output[i + 1] = inverted;
    output[i + 2] = inverted;
    output[i + 3] = data[i + 3];
  }

  return createImageData(output, width, height);
}
