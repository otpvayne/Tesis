import { describe, expect, it } from "vitest";
import { imageDataToPngDataUrl } from "@/modules/ocr/debug/render-image-data";
import { decodeImageNode } from "@/modules/ocr/preprocessing/decode-image-node";
import { createImageData } from "@/modules/ocr/preprocessing/create-image-data";

/**
 * `imageDataToPngDataUrl` (codifica) y `decodeImageNode` (decodifica) son
 * inversas — el par se prueba junto en un round-trip contra píxeles
 * conocidos, la forma más directa de confirmar que ninguna de las dos
 * introduce una transformación no intencional (ej. premultiplicación de
 * alfa, canales intercambiados). PNG es sin pérdida, así que el
 * round-trip debe reproducir los valores RGBA exactos.
 */
function twoByTwoImage(): ImageData {
  // (0,0) rojo opaco, (1,0) verde opaco, (0,1) azul opaco, (1,1) blanco opaco.
  const data = new Uint8ClampedArray(2 * 2 * 4);
  const pixels = [
    [255, 0, 0, 255],
    [0, 255, 0, 255],
    [0, 0, 255, 255],
    [255, 255, 255, 255],
  ];
  pixels.forEach(([r, g, b, a], i) => {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = a;
  });
  return createImageData(data, 2, 2);
}

describe("imageDataToPngDataUrl + decodeImageNode (round-trip)", () => {
  it("produce un data URL PNG bien formado", () => {
    const dataUrl = imageDataToPngDataUrl(twoByTwoImage());
    expect(dataUrl.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("decodificar lo que se codificó reproduce los mismos píxeles RGBA", async () => {
    const original = twoByTwoImage();
    const dataUrl = imageDataToPngDataUrl(original);
    const base64 = dataUrl.split(",")[1];
    const buffer = Buffer.from(base64, "base64");

    const decoded = await decodeImageNode(buffer);
    expect(decoded.width).toBe(2);
    expect(decoded.height).toBe(2);
    expect(Array.from(decoded.data)).toEqual(Array.from(original.data));
  });
});
