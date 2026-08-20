import { createCanvas, loadImage } from "canvas";
import { createImageData } from "@/modules/ocr/preprocessing/create-image-data";

/**
 * Decodifica un buffer de imagen (JPG/PNG) a `ImageData` usando
 * `node-canvas` — equivalente a `decodeImage`
 * (`preprocessing/decode-image.ts`) pero para Node, sin navegador.
 *
 * Mismo criterio ya usado en `modules/ocr/training/node-character-renderer.ts`:
 * Canvas API está permitida explícitamente por `CLAUDE.md` §7, y
 * `node-canvas` solo cambia *dónde* corre esa misma API (proceso Node en
 * vez de navegador), no reemplaza ningún algoritmo propio — no es una
 * librería de OCR/CV.
 *
 * Solo la usa `/api/ocr/debug` (Route Handler de servidor, sin acceso a
 * `createImageBitmap` real de navegador). El resto del pipeline real
 * sigue corriendo en el navegador del usuario dentro de un Web Worker
 * (`CLAUDE.md` §7) — esta función existe únicamente para poder diagnosticar
 * el pipeline contra una imagen subida sin depender de esa sesión de
 * navegador.
 */
export async function decodeImageNode(buffer: Buffer): Promise<ImageData> {
  let image: Awaited<ReturnType<typeof loadImage>>;
  try {
    image = await loadImage(buffer);
  } catch (cause) {
    throw new Error(
      "No se pudo decodificar la imagen: el archivo está corrupto o el formato no es compatible (solo JPG y PNG).",
      { cause },
    );
  }

  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return createImageData(new Uint8ClampedArray(data), width, height);
}
