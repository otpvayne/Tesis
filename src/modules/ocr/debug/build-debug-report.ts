import { toGrayscale } from "@/modules/ocr/preprocessing/grayscale";
import { normalizeRange } from "@/modules/ocr/preprocessing/normalize";
import { gaussianBlur } from "@/modules/ocr/preprocessing/gaussian-blur";
import { otsuBinarization } from "@/modules/ocr/preprocessing/otsu-binarization";
import { ensureTextIsForeground } from "@/modules/ocr/segmentation/normalize-polarity";
import { findConnectedComponents } from "@/modules/ocr/segmentation/connected-components";
import { extractLines } from "@/modules/ocr/segmentation/extract-lines";
import { extractWordsFromLine } from "@/modules/ocr/segmentation/extract-words";
import { extractCharactersFromWord } from "@/modules/ocr/segmentation/extract-characters";
import { normalizeCharacter } from "@/modules/ocr/segmentation/normalize-character";
import { extractHOG } from "@/modules/ocr/classification/hog-extractor";
import { createImageData } from "@/modules/ocr/preprocessing/create-image-data";
import { OCR_CONFIG } from "@/modules/ocr/config";
import type { CharacterClassifier, CharacterPrediction } from "@/modules/ocr/classification/character-classifier";

export type OcrDebugStageName = "grayscale" | "normalized" | "blurred" | "binary" | "foreground";

export interface OcrDebugStage {
  name: OcrDebugStageName;
  imageData: ImageData;
}

export interface OcrDebugBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OcrDebugCharacter {
  bbox: OcrDebugBoundingBox;
  /** Carácter aislado (fondo negro, trazo blanco) tal como lo produce `extractCharactersFromWord`, antes de normalizar tamaño. */
  isolatedImageData: ImageData;
  /** Mismo carácter después de `normalizeCharacter` — la entrada real que recibe `extractHOG`/el clasificador. */
  normalizedImageData: ImageData;
  hogDescriptor: number[];
  prediction: CharacterPrediction;
}

export interface OcrDebugWord {
  bbox: OcrDebugBoundingBox;
  characters: OcrDebugCharacter[];
}

export interface OcrDebugLine {
  bbox: OcrDebugBoundingBox;
  text: string;
  words: OcrDebugWord[];
}

export interface OcrDebugReport {
  originalImageData: ImageData;
  stages: OcrDebugStage[];
  lines: OcrDebugLine[];
  timingMs: {
    preprocess: number;
    segmentation: number;
    recognition: number;
    total: number;
  };
}

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

/**
 * Reconstruye el pipeline OCR completo (`runOCRPipelineOnImageData`,
 * `pipeline/ocr-pipeline.ts`) paso a paso, pero **capturando cada estado
 * intermedio** en vez de descartarlo — mismas funciones, mismo orden,
 * ningún algoritmo nuevo (`CLAUDE.md` §7: esto es instrumentación, no
 * reimplementación). Sirve de base a `/api/ocr/debug` (Fase de debugging
 * visual del handoff de transición del equipo): ver en qué paso concreto
 * se rompe el reconocimiento sobre una factura real, en vez de solo el
 * texto final.
 *
 * Devuelve `ImageData` crudo (no PNG/base64) a propósito — mantiene esta
 * función pura y testeable con imágenes sintéticas, igual que
 * `ocr-pipeline.test.ts`; la codificación a PNG/SVG para la respuesta HTTP
 * vive en la capa del Route Handler (`app/api/ocr/debug/route.ts`), que sí
 * depende de `node-canvas`.
 */
export function buildOcrDebugReport(raw: ImageData, classifier: CharacterClassifier): OcrDebugReport {
  const preprocessStart = now();
  const grayscale = toGrayscale(raw);
  const normalized = normalizeRange(grayscale);
  const blurred = gaussianBlur(normalized, 1);
  const binary = otsuBinarization(blurred);
  const foreground = ensureTextIsForeground(binary);
  const preprocessMs = now() - preprocessStart;

  const stages: OcrDebugStage[] = [
    { name: "grayscale", imageData: grayscale },
    { name: "normalized", imageData: normalized },
    { name: "blurred", imageData: blurred },
    { name: "binary", imageData: binary },
    { name: "foreground", imageData: foreground },
  ];

  const segmentationStart = now();
  const components = findConnectedComponents(foreground);
  const lineRegions = extractLines(foreground, components);
  const segmentationMs = now() - segmentationStart;

  const recognitionStart = now();
  const lines: OcrDebugLine[] = [];

  for (const lineRegion of lineRegions) {
    const words = extractWordsFromLine(lineRegion)
      .slice()
      .sort((a, b) => a.xStart - b.xStart);

    const debugWords: OcrDebugWord[] = [];
    let lineMinX = Infinity;
    let lineMaxX = -Infinity;
    const lineWordTexts: string[] = [];

    for (const word of words) {
      const characters = extractCharactersFromWord(word)
        .slice()
        .sort((a, b) => a.xStart - b.xStart);

      const debugCharacters: OcrDebugCharacter[] = [];
      let wordText = "";

      for (const character of characters) {
        const isolatedImageData = createImageData(
          new Uint8ClampedArray(character.pixels),
          character.width,
          character.height,
        );
        const normalizedImageData = normalizeCharacter(character, OCR_CONFIG.CHAR_SIZE);
        const descriptor = extractHOG(normalizedImageData);
        const prediction = classifier.predict(normalizedImageData);

        wordText += prediction.label;
        lineMinX = Math.min(lineMinX, character.xStart);
        lineMaxX = Math.max(lineMaxX, character.xEnd);

        debugCharacters.push({
          bbox: {
            x: character.xStart,
            y: character.yStart,
            width: character.width,
            height: character.height,
          },
          isolatedImageData,
          normalizedImageData,
          hogDescriptor: Array.from(descriptor),
          prediction,
        });
      }

      if (debugCharacters.length === 0) continue;
      if (wordText.length > 0) lineWordTexts.push(wordText);

      debugWords.push({
        bbox: {
          x: word.xStart,
          y: word.yStart,
          width: word.xEnd - word.xStart + 1,
          height: word.yEnd - word.yStart + 1,
        },
        characters: debugCharacters,
      });
    }

    if (debugWords.length === 0) continue;

    lines.push({
      bbox: {
        x: lineMinX,
        y: lineRegion.yStart,
        width: lineMaxX - lineMinX + 1,
        height: lineRegion.height,
      },
      text: lineWordTexts.join(" "),
      words: debugWords,
    });
  }

  const recognitionMs = now() - recognitionStart;

  return {
    originalImageData: raw,
    stages,
    lines,
    timingMs: {
      preprocess: preprocessMs,
      segmentation: segmentationMs,
      recognition: recognitionMs,
      total: preprocessMs + segmentationMs + recognitionMs,
    },
  };
}
