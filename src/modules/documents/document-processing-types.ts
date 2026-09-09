import type { ExtractedFields } from "@/modules/ocr/classification/field-extraction";
import type { ExtractedContractFields } from "@/modules/ocr/classification/contract-field-extraction";

/** Cualquier perfil OCR produce esta forma: campos por nombre + metadatos de extracción -- `saveOcrResult` los persiste sin conocer el perfil concreto. */
export type AnyExtractedFields = ExtractedFields | ExtractedContractFields;

export interface SaveOcrResultInput {
  documentId: string;
  modelId: string | null;
  rawText: string;
  extractedData: AnyExtractedFields;
  confidence: number;
  /** Suma de `timingMs.total` (pipeline) + tiempo de `extractFields` — medido real por quien llama, no estimado aquí. */
  processingMs: number;
}

export interface SaveOcrResultOutput {
  ocrResultId: string;
}
