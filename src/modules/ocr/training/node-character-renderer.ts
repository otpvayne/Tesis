import { createCanvas } from "canvas";
import type { CharacterRenderer } from "@/modules/ocr/classification/dataset-synthesizer";

/**
 * Implementación de `CharacterRenderer` (`dataset-synthesizer.ts`, Fase 4d)
 * para Node, sin navegador — usa `node-canvas` (`createCanvas`), que
 * expone la misma API de Canvas 2D que `document.createElement("canvas")`
 * en el navegador. No es una librería de OCR/CV: `CLAUDE.md` §7 permite
 * explícitamente "Canvas API, ImageData" como herramienta estándar; esto
 * solo cambia *dónde* corre esa misma API, no reemplaza ningún algoritmo
 * propio (segmentación/HOG/kNN siguen siendo el código de Fases 4a-4d,
 * sin tocar).
 *
 * Mismo dibujo exacto que `renderCharacterGlyph` (fondo blanco, texto
 * negro, `font`/`textAlign`/`textBaseline` idénticos) para que una muestra
 * sintetizada aquí sea estadísticamente comparable a una generada en el
 * navegador por el equipo en `/ocr-lab/train`.
 *
 * Solo existe para el script `bin/generate-initial-model.ts` (un modelo
 * inicial que desbloquea "Procesar documento" mientras no hay datos
 * reales) — nunca se importa desde código que corre en el navegador
 * (`dataset-synthesizer.ts` sigue sin depender de esto ni de "canvas").
 */
export const nodeCharacterRenderer: CharacterRenderer = (character, font, size) => {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#000000";
  ctx.font = `${Math.floor(size * 0.7)}px ${font}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(character, size / 2, size / 2);

  return ctx.getImageData(0, 0, size, size) as unknown as ImageData;
};
