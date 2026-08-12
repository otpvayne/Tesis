import { decodeImage } from "@/modules/ocr/preprocessing/decode-image";
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
import type { CharacterClassifier } from "@/modules/ocr/classification/character-classifier";

export interface OCRLine {
  text: string;
  bbox: { x: number; y: number; width: number; height: number };
  confidence: number;
}

export interface OCRResult {
  rawText: string;
  /** Promedio de la confidence de cada carácter reconocido, `[0, 1]`. `0` si no se reconoció ningún carácter. */
  confidence: number;
  lines: OCRLine[];
  processedAt: Date;
  /**
   * Medido real (`performance.now()`), no estimado. No incluye
   * `extraction` (Fase 4e §1.2) — `extractFields` es una función separada
   * que corre *después*, sobre el `OCRResult` ya construido, así que no
   * puede medirse desde dentro de esta función; quien llame a ambas junta
   * los dos tiempos (ver `document-processing.ts`).
   */
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
 * Núcleo del pipeline OCR (Fase 4a→4d encadenadas), operando directamente
 * sobre `ImageData` — separado de `runOCRPipeline` (que además decodifica
 * el archivo) para poder testear/medir el pipeline completo con imágenes
 * sintéticas construidas directamente en los tests, sin depender de
 * `decodeImage` (que requiere `createImageBitmap`/`canvas` real de
 * navegador, no disponible en el entorno de esta sesión — mismo límite ya
 * documentado en Fase 4a/4d).
 *
 * Reconstrucción de texto: líneas → palabras → caracteres, **ordenados
 * explícitamente por `xStart`** dentro de cada nivel — `findConnectedComponents`
 * (Fase 4b) los descubre en orden de escaneo BFS (fila por fila), que
 * normalmente coincide con el orden de lectura pero no lo garantiza (un
 * carácter con ascendente puede escanearse antes que uno a su izquierda
 * sin ascendente); se ordena aquí para no heredar esa suposición implícita.
 */
export function runOCRPipelineOnImageData(raw: ImageData, classifier: CharacterClassifier): OCRResult {
  const preprocessStart = now();
  const gray = toGrayscale(raw);
  const normalized = normalizeRange(gray);
  const blurred = gaussianBlur(normalized, 1);
  const binary = otsuBinarization(blurred);
  const foreground = ensureTextIsForeground(binary);
  const preprocessMs = now() - preprocessStart;

  const segmentationStart = now();
  const components = findConnectedComponents(foreground);
  const lines = extractLines(foreground, components);
  const segmentationMs = now() - segmentationStart;

  const recognitionStart = now();
  const ocrLines: OCRLine[] = [];
  const allConfidences: number[] = [];

  for (const line of lines) {
    const words = extractWordsFromLine(line)
      .slice()
      .sort((a, b) => a.xStart - b.xStart);

    const wordTexts: string[] = [];
    const lineConfidences: number[] = [];
    let lineMinX = Infinity;
    let lineMaxX = -Infinity;

    for (const word of words) {
      const characters = extractCharactersFromWord(word)
        .slice()
        .sort((a, b) => a.xStart - b.xStart);

      let wordText = "";
      for (const character of characters) {
        const normalizedChar = normalizeCharacter(character);
        const prediction = classifier.predict(normalizedChar);
        wordText += prediction.label;
        lineConfidences.push(prediction.confidence);
        allConfidences.push(prediction.confidence);
        lineMinX = Math.min(lineMinX, character.xStart);
        lineMaxX = Math.max(lineMaxX, character.xEnd);
      }
      if (wordText.length > 0) wordTexts.push(wordText);
    }

    if (wordTexts.length === 0) continue;

    ocrLines.push({
      text: wordTexts.join(" "),
      bbox: {
        x: lineMinX,
        y: line.yStart,
        width: lineMaxX - lineMinX + 1,
        height: line.height,
      },
      confidence: average(lineConfidences),
    });
  }

  const recognitionMs = now() - recognitionStart;

  return {
    rawText: ocrLines.map((line) => line.text).join("\n"),
    confidence: average(allConfidences),
    lines: ocrLines,
    processedAt: new Date(),
    timingMs: {
      preprocess: preprocessMs,
      segmentation: segmentationMs,
      recognition: recognitionMs,
      total: preprocessMs + segmentationMs + recognitionMs,
    },
  };
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Punto de entrada real: decodifica el archivo (`decodeImage`, **solo
 * funciona en un navegador real** — ver `runOCRPipelineOnImageData` arriba)
 * y corre el núcleo del pipeline sobre el resultado.
 */
export async function runOCRPipeline(file: File | Blob, classifier: CharacterClassifier): Promise<OCRResult> {
  const raw = await decodeImage(file);
  return runOCRPipelineOnImageData(raw, classifier);
}
