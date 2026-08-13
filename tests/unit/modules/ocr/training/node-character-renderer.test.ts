import { describe, expect, it } from "vitest";
import { nodeCharacterRenderer } from "@/modules/ocr/training/node-character-renderer";

/**
 * A diferencia de `renderCharacterGlyph` (navegador real, no testeable en
 * esta sesión), `node-canvas` sí corre en Vitest -- se prueba que
 * efectivamente dibuja el glifo (píxeles negros presentes) y no solo
 * produce un lienzo en blanco.
 *
 * Timeout ampliado (20s, no los 5s por defecto): la primera vez que cada
 * worker de Vitest inicializa el backend nativo de canvas/fuentes bajo
 * carga (toda la suite corriendo en paralelo) puede tardar varios
 * segundos -- confirmado corriendo este archivo solo (<1s) vs. dentro de
 * la suite completa (a veces >5s). No es una prueba lenta en sí, es
 * arranque de font/Cairo contendido entre procesos paralelos.
 */
const CANVAS_TEST_TIMEOUT_MS = 20000;

describe("nodeCharacterRenderer", () => {
  it(
    "dibuja un carácter -- produce píxeles oscuros sobre fondo blanco",
    () => {
      const size = 32;
      const image = nodeCharacterRenderer("A", "Arial", size);

      expect(image.width).toBe(size);
      expect(image.height).toBe(size);

      let darkPixels = 0;
      for (let i = 0; i < image.data.length; i += 4) {
        if (image.data[i] < 128) darkPixels++;
      }
      expect(darkPixels).toBeGreaterThan(0);
    },
    CANVAS_TEST_TIMEOUT_MS,
  );

  it(
    "el fondo fuera del glifo es blanco",
    () => {
      const image = nodeCharacterRenderer("A", "Arial", 32);
      // Esquina superior izquierda: fuera del área donde cae el glifo centrado.
      const cornerIndex = 0;
      expect(image.data[cornerIndex]).toBe(255);
      expect(image.data[cornerIndex + 1]).toBe(255);
      expect(image.data[cornerIndex + 2]).toBe(255);
    },
    CANVAS_TEST_TIMEOUT_MS,
  );

  it(
    "caracteres distintos producen ImageData distinta",
    () => {
      const imageA = nodeCharacterRenderer("A", "Arial", 32);
      const imageW = nodeCharacterRenderer("W", "Arial", 32);
      expect(Array.from(imageA.data)).not.toEqual(Array.from(imageW.data));
    },
    CANVAS_TEST_TIMEOUT_MS,
  );
});
