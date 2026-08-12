import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeImage } from "@/modules/ocr/preprocessing/decode-image";

/**
 * jsdom no implementa `createImageBitmap` ni un `<canvas>` 2D real (ver
 * verificación hecha antes de escribir este archivo: `getContext('2d')`
 * devuelve `null`, `createImageBitmap` es `undefined`). Esto significa que
 * el camino feliz real — decodificar un JPG/PNG de verdad y obtener los
 * píxeles correctos — **no se puede probar automatizado en esta sesión**;
 * requeriría un navegador real o el paquete nativo `canvas` (no se agrega
 * como dependencia solo para esto). Lo que sí es 100% real (no mockeado
 * para fingir cobertura) es el manejo de errores: el primer test explota
 * la ausencia real de `createImageBitmap` en jsdom, sin necesidad de
 * simularla.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("decodeImage — manejo de errores (ver nota de cobertura arriba)", () => {
  it("lanza un error claro cuando createImageBitmap no existe (caso real en jsdom, sin mockear)", async () => {
    expect(typeof globalThis.createImageBitmap).toBe("undefined");
    const file = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
    await expect(decodeImage(file)).rejects.toThrow(/no admite la decodificación/i);
  });

  it("envuelve un rechazo de createImageBitmap (archivo corrupto) en un mensaje en español", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockRejectedValue(new DOMException("bad data", "InvalidStateError")),
    );
    const file = new Blob([new Uint8Array([0, 0, 0])], { type: "image/png" });
    await expect(decodeImage(file)).rejects.toThrow(/no se pudo decodificar/i);
  });

  it("lanza un error claro cuando no se puede obtener el contexto 2D (jsdom real, sin mockear)", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({ width: 2, height: 2, close: vi.fn() }),
    );
    const file = new Blob([new Uint8Array([0, 0, 0])], { type: "image/png" });
    // jsdom devuelve null en canvas.getContext('2d') de verdad -- no es un mock de ese comportamiento.
    await expect(decodeImage(file)).rejects.toThrow(/contexto 2D/i);
  });

  it("libera el ImageBitmap (close()) incluso cuando falla después de decodificarlo", async () => {
    const close = vi.fn();
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 2, height: 2, close }));
    const file = new Blob([new Uint8Array([0, 0, 0])], { type: "image/png" });
    await expect(decodeImage(file)).rejects.toThrow();
    expect(close).toHaveBeenCalledOnce();
  });
});
