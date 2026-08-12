import { describe, expect, it } from "vitest";
import { createImageData } from "@/modules/ocr/preprocessing/create-image-data";
import { toGrayscale } from "@/modules/ocr/preprocessing/grayscale";
import { normalizeRange } from "@/modules/ocr/preprocessing/normalize";
import { otsuBinarization } from "@/modules/ocr/preprocessing/otsu-binarization";
import { denoise } from "@/modules/ocr/preprocessing/denoise";
import { ensureTextIsForeground } from "@/modules/ocr/segmentation/normalize-polarity";
import { findConnectedComponents } from "@/modules/ocr/segmentation/connected-components";
import { extractLines } from "@/modules/ocr/segmentation/extract-lines";
import { extractWordsFromLine } from "@/modules/ocr/segmentation/extract-words";
import { extractCharactersFromWord } from "@/modules/ocr/segmentation/extract-characters";
import { normalizeCharacter } from "@/modules/ocr/segmentation/normalize-character";

/**
 * Test de integración de extremo a extremo: Fase 4a completa
 * (grayscale → normalize → otsu → denoise) encadenada con Fase 4b completa
 * (polaridad → componentes → líneas → palabras → caracteres →
 * normalización), sobre una imagen sintética de "factura" (papel claro,
 * 2 líneas de 2 "palabras" oscuras cada una) — sin pasar por `decodeImage`
 * (requiere canvas real, ver nota de cobertura en Fase 4a).
 *
 * Esta imagen sintética es también la que expuso el bug de polaridad real
 * entre 4a y 4b (`normalize-polarity.ts`): sin `ensureTextIsForeground`,
 * este mismo test fallaría con 0 líneas encontradas, porque
 * `findConnectedComponents` habría intentado segmentar el papel en blanco
 * en vez del texto oscuro.
 */
function makeSyntheticInvoice(): ImageData {
  const width = 60;
  const height = 45;
  const data = new Uint8ClampedArray(width * height * 4);

  // Papel claro de fondo.
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = 230;
    data[i * 4 + 1] = 225;
    data[i * 4 + 2] = 230;
    data[i * 4 + 3] = 255;
  }

  function paintBlock(x0: number, y0: number, x1: number, y1: number, value: number) {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const idx = (y * width + x) * 4;
        data[idx] = value;
        data[idx + 1] = value;
        data[idx + 2] = value;
        data[idx + 3] = 255;
      }
    }
  }

  // Línea 1 (filas 5-19): 2 "palabras" oscuras (15 filas de alto, por
  // encima de CHAR_MIN_HEIGHT=10).
  paintBlock(5, 5, 15, 19, 20);
  paintBlock(30, 5, 40, 19, 20);

  // Línea 2 (filas 25-39), separada de la línea 1 por un valle (filas 20-24).
  paintBlock(5, 25, 15, 39, 20);
  paintBlock(30, 25, 40, 39, 20);

  return createImageData(data, width, height);
}

describe("pipeline 4a + 4b: preprocesamiento -> segmentación completa", () => {
  it("produce 2 líneas, 2 palabras por línea, y caracteres normalizados a 32×32", () => {
    const raw = makeSyntheticInvoice();

    // Fase 4a
    const gray = toGrayscale(raw);
    const normalized = normalizeRange(gray);
    const binary = otsuBinarization(normalized);
    const denoised = denoise(binary, 3);

    // Puente 4a -> 4b
    const foreground = ensureTextIsForeground(denoised);

    // Fase 4b
    const components = findConnectedComponents(foreground);
    const lines = extractLines(foreground, components);
    expect(lines).toHaveLength(2);

    for (const line of lines) {
      const words = extractWordsFromLine(line);
      expect(words).toHaveLength(2);

      for (const word of words) {
        const characters = extractCharactersFromWord(word);
        expect(characters.length).toBeGreaterThan(0);

        for (const character of characters) {
          const normalizedChar = normalizeCharacter(character);
          expect(normalizedChar.width).toBe(32);
          expect(normalizedChar.height).toBe(32);

          // el carácter normalizado debe tener contenido real (no todo negro)
          let hasWhite = false;
          for (let i = 0; i < normalizedChar.data.length; i += 4) {
            if (normalizedChar.data[i] === 255) {
              hasWhite = true;
              break;
            }
          }
          expect(hasWhite).toBe(true);
        }
      }
    }
  });

  it("sin ensureTextIsForeground, el mismo pipeline encuentra el papel en vez del texto (regresión del bug real)", () => {
    const raw = makeSyntheticInvoice();
    const gray = toGrayscale(raw);
    const normalized = normalizeRange(gray);
    const binary = otsuBinarization(normalized);
    const denoised = denoise(binary, 3);

    // Sin el paso de polaridad: el papel (mayoría blanca tras Otsu) se
    // trata como "primer plano" -- un único componente gigante que cubre
    // casi toda la imagen, no 4 bloques de texto.
    const components = findConnectedComponents(denoised);
    const totalPixels = 60 * 45;
    const biggestComponent = Math.max(...components.map((c) => c.pixels.length));
    expect(biggestComponent).toBeGreaterThan(totalPixels * 0.5);
  });
});
