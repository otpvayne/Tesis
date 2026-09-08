import { createWorker } from "tesseract.js";
import type { Page as TesseractPage } from "tesseract.js";
import type { OCRLine, OCRResult } from "@/modules/ocr/pipeline/ocr-pipeline";

/**
 * ⚠️ EXCEPCIÓN A `CLAUDE.md` §7 — ver `docs/decisions/0002-uso-libreria-ocr-preentrenada.md`
 * (ADR-0002) para la decisión formal, y la nota fechada 2026-09-08 en `CLAUDE.md` §7
 * para el alcance exacto de implementación que resuelve el "Pendiente" de ese ADR.
 *
 * Este módulo es el ÚNICO punto del proyecto que depende de una librería de
 * reconocimiento de caracteres de terceros (Tesseract.js). No reemplaza el
 * pipeline propio (`modules/ocr/pipeline/ocr-pipeline.ts`, HOG+kNN desde
 * cero) — se agrega como motor alternativo, seleccionable con la variable
 * de entorno `NEXT_PUBLIC_OCR_ENGINE` (ver `process-document-client.tsx`),
 * porque el equipo necesita una demo funcional a corto plazo mientras el
 * pipeline propio sigue mejorando su accuracy real (67.4% en test real al
 * cierre de Fase 4f, ver `docs/ocr/evaluation.md`). El pipeline propio
 * sigue siendo el aporte académico medido de la tesis.
 *
 * Produce un `OCRResult` con la misma forma exacta que el pipeline propio,
 * para que `extractFields` (`field-extraction.ts`) y `saveOcrResult`
 * (`document-processing.ts`) —ambos agnósticos al motor— no necesiten
 * ningún cambio.
 */

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function bboxFromTesseract(bbox: { x0: number; y0: number; x1: number; y1: number }): OCRLine["bbox"] {
  return {
    x: bbox.x0,
    y: bbox.y0,
    width: bbox.x1 - bbox.x0,
    height: bbox.y1 - bbox.y0,
  };
}

/**
 * Aplana `Page.blocks -> paragraphs -> lines` de Tesseract.js a `OCRLine[]`,
 * y calcula `rawText`/`confidence` agregados con la misma convención que
 * `runOCRPipelineOnImageData` (confidence promedio en `[0, 1]`, `rawText`
 * como líneas unidas por `\n`). Separada de `runTesseractOCR` para poder
 * testearla sin correr el motor real de Tesseract (WASM, no disponible en
 * esta sesión — mismo límite documentado para `decodeImage` en Fase 4a).
 */
export function mapTesseractResultToOCRResult(page: TesseractPage, timingMs: OCRResult["timingMs"]): OCRResult {
  const ocrLines: OCRLine[] = [];

  for (const block of page.blocks ?? []) {
    for (const paragraph of block.paragraphs) {
      for (const line of paragraph.lines) {
        const text = line.text.replace(/\n+$/, "");
        if (text.trim().length === 0) {
          continue;
        }
        ocrLines.push({
          text,
          bbox: bboxFromTesseract(line.bbox),
          // Tesseract.js reporta confidence en [0, 100]; el proyecto usa [0, 1].
          confidence: line.confidence / 100,
        });
      }
    }
  }

  const rawText = ocrLines.map((line) => line.text).join("\n");
  const confidence = ocrLines.length > 0 ? ocrLines.reduce((sum, line) => sum + line.confidence, 0) / ocrLines.length : 0;

  return {
    rawText,
    confidence,
    lines: ocrLines,
    processedAt: new Date(),
    timingMs,
  };
}

/**
 * Corre Tesseract.js (idioma español) sobre la imagen del documento y
 * devuelve un `OCRResult` compatible con el resto del pipeline. Crea y
 * termina un worker por llamada — simple y correcto para el volumen de
 * "un documento a la vez" de `/documents/[id]`; si el volumen crece,
 * considerar un `Scheduler` de Tesseract.js reutilizado entre llamadas.
 */
export async function runTesseractOCR(image: File | Blob): Promise<OCRResult> {
  const totalStart = now();
  const worker = await createWorker("spa");

  try {
    const recognitionStart = now();
    const { data } = await worker.recognize(image, {}, { blocks: true });
    const recognitionMs = now() - recognitionStart;
    const totalMs = now() - totalStart;

    return mapTesseractResultToOCRResult(data, {
      preprocess: 0,
      segmentation: 0,
      recognition: recognitionMs,
      total: totalMs,
    });
  } finally {
    await worker.terminate();
  }
}
