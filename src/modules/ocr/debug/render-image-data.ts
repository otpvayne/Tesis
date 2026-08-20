import { createCanvas, ImageData as NodeImageData } from "canvas";

/**
 * Serializa un `ImageData` a un data URL PNG usando `node-canvas` — inverso
 * de `decodeImageNode` (`preprocessing/decode-image-node.ts`). Solo existe
 * para `/api/ocr/debug`: es la única forma de mostrarle al equipo, dentro
 * de una respuesta JSON, cómo se ve la imagen después de cada paso del
 * pipeline (escala de grises, Otsu, binarización, cada carácter
 * normalizado a 32×32...) sin tener que reconstruir el pipeline a mano en
 * el navegador.
 *
 * Recibe el `ImageData` "estructural" que produce el resto de
 * `modules/ocr` (ver `createImageData`, que puede devolver el objeto plano
 * `{ data, width, height }` en vez de una instancia real de `ImageData`
 * fuera de un navegador) — por eso reconstruye explícitamente un
 * `ImageData` de `node-canvas` a partir de sus campos en vez de asumir que
 * ya es una instancia compatible.
 */
export function imageDataToPngDataUrl(imageData: ImageData): string {
  const canvas = createCanvas(imageData.width, imageData.height);
  const ctx = canvas.getContext("2d");
  const nodeImageData = new NodeImageData(
    new Uint8ClampedArray(imageData.data),
    imageData.width,
    imageData.height,
  );
  ctx.putImageData(nodeImageData, 0, 0);
  return canvas.toDataURL("image/png");
}
