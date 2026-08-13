import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeImage } from "@/modules/ocr/preprocessing/decode-image";

/**
 * jsdom no implementa `createImageBitmap` (sigue `undefined` — el primer
 * test explota esa ausencia real, sin mockear). `getContext('2d')` sí
 * dejó de ser `null` por defecto: desde que Fase 5 agregó `canvas`
 * (node-canvas) como devDependency para `bin/generate-initial-model.ts`,
 * jsdom lo detecta automáticamente y delega ahí un backend de canvas real
 * (comportamiento propio de jsdom, no algo que este proyecto configuró a
 * propósito). El camino feliz completo — decodificar un JPG/PNG real y
 * obtener los píxeles correctos — sigue sin probarse aquí (eso
 * necesitaría un archivo de imagen real, no un `Blob` de bytes
 * arbitrarios); el test del contexto 2D nulo ahora mockea
 * `getContext` explícitamente en vez de depender de la ausencia previa.
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

  it("lanza un error claro cuando no se puede obtener el contexto 2D", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockResolvedValue({ width: 2, height: 2, close: vi.fn() }),
    );
    // Con `canvas` instalado (Fase 5), jsdom ya no devuelve null aquí por
    // defecto -- se mockea explícitamente para seguir probando esta rama.
    const getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const file = new Blob([new Uint8Array([0, 0, 0])], { type: "image/png" });
    await expect(decodeImage(file)).rejects.toThrow(/contexto 2D/i);
    getContextSpy.mockRestore();
  });

  it(
    "libera el ImageBitmap (close()) incluso cuando falla después de decodificarlo",
    async () => {
      const close = vi.fn();
      vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 2, height: 2, close }));
      const file = new Blob([new Uint8Array([0, 0, 0])], { type: "image/png" });
      // getContext real (no mockeado) -- toca el backend nativo de canvas
      // de verdad (drawImage sobre un bitmap falso, que node-canvas
      // rechaza) -- mismo motivo de timeout ampliado que
      // node-character-renderer.test.ts: arranque de Cairo/fuentes
      // contendido bajo la suite completa en paralelo.
      await expect(decodeImage(file)).rejects.toThrow();
      expect(close).toHaveBeenCalledOnce();
    },
    20000,
  );
});
