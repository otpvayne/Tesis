import type { ExtractedFields } from "@/modules/ocr/classification/field-extraction";

export interface SaveOcrResultInput {
  documentId: string;
  modelId: string | null;
  rawText: string;
  extractedData: ExtractedFields;
  confidence: number;
  /** Suma de `timingMs.total` (pipeline) + tiempo de `extractFields` — medido real por quien llama, no estimado aquí. */
  processingMs: number;
}

export interface SaveOcrResultOutput {
  ocrResultId: string;
}
