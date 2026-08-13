import { describe, expect, it } from "vitest";
import { decodeImageNode } from "@/modules/ocr/preprocessing/decode-image-node";

describe("decodeImageNode — manejo de errores", () => {
  it("envuelve el rechazo de node-canvas (buffer corrupto/no es una imagen) en un mensaje en español", async () => {
    const garbage = Buffer.from([1, 2, 3, 4, 5]);
    await expect(decodeImageNode(garbage)).rejects.toThrow(/no se pudo decodificar/i);
  });
});
