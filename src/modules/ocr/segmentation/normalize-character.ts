import { createImageData } from "@/modules/ocr/preprocessing/create-image-data";
import { OCR_CONFIG } from "@/modules/ocr/config";
import type { CharacterRegion } from "@/modules/ocr/segmentation/extract-characters";

/**
 * Redimensiona un carácter segmentado (tamaño variable) a un lienzo
 * cuadrado `targetSize × targetSize` **sin distorsionar su forma**:
 * estirar un carácter rectangular a un cuadrado rompería su geometría y
 * confundiría al clasificador (Fase 4c, HOG es sensible a la forma). En
 * su lugar:
 *
 * 1. Se calcula el nuevo tamaño manteniendo el aspect ratio
 *    (`width / height`) del carácter original, con el lado más largo
 *    llevado exactamente a `targetSize`.
 * 2. Se hace resize a ese tamaño con **interpolación nearest-neighbor**
 *    (no bilineal/suavizada): un carácter es una forma binaria de bordes
 *    duros — suavizar introduciría grises intermedios que no existen en
 *    los datos originales y difuminaría justo los bordes que el
 *    clasificador necesita distinguir.
 * 3. El resultado se centra en el lienzo `targetSize × targetSize`, con
 *    el margen sobrante relleno en negro (mismo fondo que ya usa
 *    `extractCharactersFromWord`).
 */
export function normalizeCharacter(
  charRegion: CharacterRegion,
  targetSize: number = OCR_CONFIG.CHAR_SIZE,
): ImageData {
  const { width, height, pixels } = charRegion;
  const ratio = width / height;

  const newWidth = Math.max(1, ratio >= 1 ? targetSize : Math.round(targetSize * ratio));
  const newHeight = Math.max(1, ratio >= 1 ? Math.round(targetSize / ratio) : targetSize);

  const resized = resizeNearestNeighbor(pixels, width, height, newWidth, newHeight);

  const output = new Uint8ClampedArray(targetSize * targetSize * 4);
  for (let i = 0; i < targetSize * targetSize; i++) {
    output[i * 4 + 3] = 255; // fondo negro opaco
  }

  const offsetX = Math.floor((targetSize - newWidth) / 2);
  const offsetY = Math.floor((targetSize - newHeight) / 2);

  for (let y = 0; y < newHeight; y++) {
    for (let x = 0; x < newWidth; x++) {
      const dstX = x + offsetX;
      const dstY = y + offsetY;
      if (dstX < 0 || dstX >= targetSize || dstY < 0 || dstY >= targetSize) continue;

      const srcIdx = (y * newWidth + x) * 4;
      const dstIdx = (dstY * targetSize + dstX) * 4;
      output[dstIdx] = resized[srcIdx];
      output[dstIdx + 1] = resized[srcIdx + 1];
      output[dstIdx + 2] = resized[srcIdx + 2];
      output[dstIdx + 3] = resized[srcIdx + 3];
    }
  }

  return createImageData(output, targetSize, targetSize);
}

function resizeNearestNeighbor(
  src: Uint8ClampedArray,
  srcWidth: number,
  srcHeight: number,
  dstWidth: number,
  dstHeight: number,
): Uint8ClampedArray {
  const dst = new Uint8ClampedArray(dstWidth * dstHeight * 4);

  for (let y = 0; y < dstHeight; y++) {
    const srcY = Math.min(srcHeight - 1, Math.floor((y * srcHeight) / dstHeight));
    for (let x = 0; x < dstWidth; x++) {
      const srcX = Math.min(srcWidth - 1, Math.floor((x * srcWidth) / dstWidth));
      const srcIdx = (srcY * srcWidth + srcX) * 4;
      const dstIdx = (y * dstWidth + x) * 4;
      dst[dstIdx] = src[srcIdx];
      dst[dstIdx + 1] = src[srcIdx + 1];
      dst[dstIdx + 2] = src[srcIdx + 2];
      dst[dstIdx + 3] = src[srcIdx + 3];
    }
  }

  return dst;
}
