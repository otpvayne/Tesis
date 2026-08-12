import { createImageData } from "@/modules/ocr/preprocessing/create-image-data";

/**
 * Construye una `ImageData` binaria a partir de "arte ASCII": `#` = blanco
 * (255), cualquier otro carácter = negro (0). Todas las filas deben tener
 * el mismo ancho. Usado en todos los tests de `modules/ocr/segmentation`
 * para que los patrones de prueba sean legibles a simple vista en vez de
 * arrays planos de números.
 */
export function binaryImageFromRows(rows: string[]): ImageData {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const data = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const value = rows[y][x] === "#" ? 255 : 0;
      const idx = (y * width + x) * 4;
      data[idx] = value;
      data[idx + 1] = value;
      data[idx + 2] = value;
      data[idx + 3] = 255;
    }
  }

  return createImageData(data, width, height);
}
