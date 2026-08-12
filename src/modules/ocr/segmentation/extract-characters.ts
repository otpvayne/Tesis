import { OCR_CONFIG } from "@/modules/ocr/config";
import type { Component } from "@/modules/ocr/segmentation/connected-components";
import type { WordRegion } from "@/modules/ocr/segmentation/extract-words";

export interface CharacterRegion {
  component: Component;
  xStart: number;
  xEnd: number;
  yStart: number;
  yEnd: number;
  width: number;
  height: number;
  /** Píxeles RGBA del carácter aislado (fondo negro opaco, trazo blanco), tamaño `width × height`. */
  pixels: Uint8ClampedArray;
}

/**
 * Extrae un `CharacterRegion` por cada componente conectado de la palabra:
 * la suposición **1 componente = 1 carácter**, válida para facturas
 * impresas bien definidas (ver limitación abajo). Los componentes fuera
 * del rango `[CHAR_MIN_HEIGHT, CHAR_MAX_HEIGHT]` (`modules/ocr/config.ts`)
 * se descartan como ruido o fallo de segmentación, no como caracteres
 * legítimos.
 *
 * **Limitación conocida:** si un carácter queda fracturado en más de un
 * componente (ej. una "í" con el punto separado del cuerpo por
 * binarización imperfecta), o si dos caracteres se tocan y quedan
 * fusionados en un único componente (ej. una "r" e "n" pegadas en una
 * fuente condensada), esta función los trata igual — uno de más o uno de
 * menos. No hay lógica de re-fusión ni de re-partición en esta fase;
 * documentado como deuda técnica para revisar con datos reales de
 * facturas (Fase 4d/4f).
 */
export function extractCharactersFromWord(word: WordRegion): CharacterRegion[] {
  return word.components
    .filter(
      (component) =>
        component.boundingBox.height >= OCR_CONFIG.CHAR_MIN_HEIGHT &&
        component.boundingBox.height <= OCR_CONFIG.CHAR_MAX_HEIGHT,
    )
    .map((component) => isolateComponentPixels(component));
}

function isolateComponentPixels(component: Component): CharacterRegion {
  const { x, y, width, height } = component.boundingBox;
  const pixels = new Uint8ClampedArray(width * height * 4);

  // Fondo negro opaco por defecto (alfa=255 en todo el buffer); el trazo
  // del carácter se pinta blanco encima solo en sus propios píxeles.
  for (let i = 0; i < width * height; i++) {
    pixels[i * 4 + 3] = 255;
  }

  for (const [px, py] of component.pixels) {
    const localX = px - x;
    const localY = py - y;
    const idx = (localY * width + localX) * 4;
    pixels[idx] = 255;
    pixels[idx + 1] = 255;
    pixels[idx + 2] = 255;
    pixels[idx + 3] = 255;
  }

  return {
    component,
    xStart: x,
    xEnd: x + width - 1,
    yStart: y,
    yEnd: y + height - 1,
    width,
    height,
    pixels,
  };
}
