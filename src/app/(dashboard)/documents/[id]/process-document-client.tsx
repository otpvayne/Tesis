"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runOCRPipeline } from "@/modules/ocr/pipeline/ocr-pipeline";
import { runTesseractOCR } from "@/modules/ocr/engines/tesseract-engine";
import { CharacterClassifier } from "@/modules/ocr/classification/character-classifier";
import { extractFieldsForDocumentType, ocrEngineForDocumentType, type OcrEngine } from "@/modules/ocr/classification/document-ocr-profile";
import { saveOcrResult, markOcrFailed, markOcrStarted } from "@/modules/documents/document-processing";
import type { DocumentType } from "@/modules/documents/types";
import { WarningIcon } from "@/components/icons/WarningIcon";

const PROCESSING_WARNING_THRESHOLD_MS = 5000; // RNF-001

/**
 * ⚠️ EXCEPCIÓN A `CLAUDE.md` §7 — ver ADR-0002
 * (`docs/decisions/0002-uso-libreria-ocr-preentrenada.md`) y la nota fechada
 * 2026-09-08 en `CLAUDE.md` §7 para el alcance exacto.
 *
 * Motor de reconocimiento a usar. `"custom"` (default, sin configurar nada)
 * mantiene el comportamiento exacto de siempre: pipeline propio HOG+kNN +
 * modelo activo de `ocr_models`. `"tesseract"` usa Tesseract.js
 * (`modules/ocr/engines/tesseract-engine.ts`) como motor alternativo. No
 * cambia nada para nadie que no configure la variable de entorno
 * explícitamente. `contract_es` ignora esta variable -- siempre usa
 * Tesseract.js (`ocrEngineForDocumentType`, ver
 * `docs/decisions/0003-perfil-ocr-contratos.md`).
 */
const CONFIGURED_OCR_ENGINE: OcrEngine = process.env.NEXT_PUBLIC_OCR_ENGINE === "tesseract" ? "tesseract" : "custom";

interface ActiveModelResponse {
  modelId: string;
  version: string;
  modelData: unknown;
}

/**
 * Corre el pipeline OCR completo **en el navegador** — `decodeImage`
 * (Fase 4a) usa `createImageBitmap`/`<canvas>`, que no existen en un
 * Server Action (Node.js). El modelo llega vía `/api/ocr/active-model`
 * (RLS de `ocr_models` es solo-ADMIN; ese endpoint es el puente
 * controlado para cualquier usuario autenticado, ver su propio archivo).
 * El resultado ya calculado se guarda con `saveOcrResult` (Server
 * Action), que sí puede correr en el servidor porque no toca canvas.
 */
export function ProcessDocumentClient({ documentId, signedUrl, documentType }: { documentId: string; signedUrl: string; documentType: DocumentType }) {
  const router = useRouter();
  const [isProcessing, startProcessing] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  function handleProcess() {
    setError(null);
    setWarning(null);

    startProcessing(async () => {
      try {
        await markOcrStarted(documentId);

        const imageResponse = await fetch(signedUrl);
        if (!imageResponse.ok) {
          throw new Error("No se pudo descargar la imagen del documento.");
        }
        const blob = await imageResponse.blob();

        const engine = ocrEngineForDocumentType(documentType, CONFIGURED_OCR_ENGINE);

        let modelId: string | null;
        let ocrResult;

        if (engine === "tesseract") {
          // Motor alternativo (excepción aprobada, ver CLAUDE.md §7): no
          // depende de ningún modelo entrenado propio, así que no se llama
          // a `/api/ocr/active-model`.
          modelId = null;
          ocrResult = await runTesseractOCR(blob);
        } else {
          const modelResponse = await fetch(`/api/ocr/active-model?documentType=${encodeURIComponent(documentType)}`);
          if (!modelResponse.ok) {
            const body = await modelResponse.json().catch(() => ({}));
            throw new Error(body.error ?? `No se pudo obtener el modelo activo (${modelResponse.status}).`);
          }
          const activeModel = (await modelResponse.json()) as ActiveModelResponse;
          modelId = activeModel.modelId;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const classifier = CharacterClassifier.fromJSON(activeModel.modelData as any);
          ocrResult = await runOCRPipeline(blob, classifier);
        }

        const extractionStart = performance.now();
        const fields = extractFieldsForDocumentType(documentType, ocrResult);
        const extractionMs = performance.now() - extractionStart;
        const totalMs = ocrResult.timingMs.total + extractionMs;

        if (totalMs > PROCESSING_WARNING_THRESHOLD_MS) {
          setWarning(
            `Procesamiento tomó ${(totalMs / 1000).toFixed(1)}s, por encima del objetivo de <5s (RNF-001).`,
          );
        }

        await saveOcrResult({
          documentId,
          modelId,
          rawText: ocrResult.rawText,
          extractedData: fields,
          confidence: ocrResult.confidence,
          processingMs: totalMs,
        });

        router.refresh();
      } catch (err) {
        const message = err instanceof Error ? err.message : "No se pudo procesar el documento.";
        setError(message);
        await markOcrFailed(documentId, message);
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleProcess}
        disabled={isProcessing}
        className="rounded-md border border-sky-500 px-4 py-3 text-sm font-medium text-sky-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-sky-400 dark:text-sky-300"
      >
        {isProcessing ? "Procesando (puede tardar varios segundos)..." : "Procesar documento (OCR)"}
      </button>
      {error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
      {warning ? (
        <p role="alert" className="flex items-center gap-1 text-sm text-amber-700 dark:text-amber-400">
          <WarningIcon className="h-4 w-4" />
          {warning}
        </p>
      ) : null}
    </div>
  );
}
