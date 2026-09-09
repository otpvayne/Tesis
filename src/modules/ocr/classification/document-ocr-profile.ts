import type { OCRResult } from "@/modules/ocr/pipeline/ocr-pipeline";
import type { DocumentType } from "@/modules/documents/types";
import type { AnyExtractedFields } from "@/modules/documents/document-processing-types";
import { extractFields } from "@/modules/ocr/classification/field-extraction";
import { extractContractFields } from "@/modules/ocr/classification/contract-field-extraction";

export type OcrEngine = "custom" | "tesseract";

/**
 * Qué extractor de campos (RF-003) corre para cada perfil OCR -- separado
 * de `process-document-client.tsx` para poder probarlo sin navegador
 * (mismo criterio de "core puro + wrapper" del resto del proyecto).
 */
export function extractFieldsForDocumentType(documentType: DocumentType, ocrResult: OCRResult): AnyExtractedFields {
  if (documentType === "contract_es") {
    return extractContractFields(ocrResult);
  }
  return extractFields(ocrResult);
}

/**
 * Qué motor de reconocimiento corre para cada perfil OCR. `contract_es`
 * siempre usa Tesseract.js -- no existe (ni se va a entrenar en este
 * cambio) un modelo propio HOG+kNN para contratos, ver
 * `docs/decisions/0003-perfil-ocr-contratos.md`. `invoice_es` respeta el
 * motor configurado (`NEXT_PUBLIC_OCR_ENGINE`, por defecto `"custom"`,
 * ver ADR-0002) -- este cambio no altera su comportamiento.
 */
export function ocrEngineForDocumentType(documentType: DocumentType, configuredEngine: OcrEngine): OcrEngine {
  if (documentType === "contract_es") {
    return "tesseract";
  }
  return configuredEngine;
}
