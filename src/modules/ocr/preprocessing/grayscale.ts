import { createImageData } from "@/modules/ocr/preprocessing/create-image-data";

/**
 * Convierte una imagen RGBA a escala de grises usando la luminancia
 * perceptual estándar ITU-R BT.601: `Y = 0.299·R + 0.587·G + 0.114·B`. Se
 * usa esta ponderación (no un promedio simple `(R+G+B)/3`) porque el ojo
 * humano percibe el canal verde con mucho más peso que el azul — un
 * promedio simple produciría un gris perceptualmente incorrecto (texto en
 * tinta azul se vería más claro de lo que realmente se percibe, por
 * ejemplo). El resultado sigue siendo RGBA (R=G=B=Y, alfa preservado) para
 * poder seguir usando el mismo pipeline de Canvas — no se comprime a un
 * solo canal.
 *
 * NO se usa `ctx.filter = "grayscale(100%)"` de Canvas: eso es un filtro
 * CSS aplicado en la capa de composición del navegador, no da acceso a los
 * valores de luminancia calculados desde código, y su fórmula exacta no
 * está garantizada por la especificación.
 */
export function toGrayscale(imageData: ImageData): ImageData {
  const { data, width, height } = imageData;
  const output = new Uint8ClampedArray(data.length);

  for (let i = 0; i < data.length; i += 4) {
    const y = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    output[i] = y;
    output[i + 1] = y;
    output[i + 2] = y;
    output[i + 3] = data[i + 3];
  }

  return createImageData(output, width, height);
}
