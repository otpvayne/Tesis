import type { OCRResult } from "@/modules/ocr/pipeline/ocr-pipeline";
import { type ExtractedField, extractKeywordLineField, extractMoneyField, extractStringField } from "@/modules/ocr/classification/field-extraction-helpers";

export type { SourceRegion, ExtractedField } from "@/modules/ocr/classification/field-extraction-helpers";

export interface ExtractedFields {
  proveedor: ExtractedField<string>;
  nit: ExtractedField<string>;
  fecha: ExtractedField<string>;
  iva: ExtractedField<number>;
  valor: ExtractedField<number>;
  total: ExtractedField<number>;
  rawOCR: string;
  extractionMethod: "pattern";
}

const NIT_PATTERN = /\d{1,3}\.\d{3}\.\d{3}-\d{1}|\d{9,11}/g;
const FECHA_PATTERN = /\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{4}/g;

const NIT_KEYWORDS = ["NIT", "N.I.T"];
const FECHA_KEYWORDS = ["Fecha", "Emisión", "Emision", "Date"];
const IVA_KEYWORDS = ["IVA", "Impuesto"];
const VALOR_KEYWORDS = ["Valor", "Subtotal"];
const TOTAL_KEYWORDS = ["Total"];
const PROVEEDOR_KEYWORDS = ["Proveedor", "Emisor", "Razón Social", "Razon Social", "Señor", "Senor"];

/**
 * Extracción de campos de RF-003 por regex + keywords — heurística, no ML
 * (`CLAUDE.md` §7 solo prohíbe ML/CV de terceros para el *reconocimiento*
 * de caracteres; esto opera sobre texto ya reconocido). Ver
 * `docs/ocr/extraction.md` para el detalle de cada patrón, las razones de
 * las 3 confidences y limitaciones conocidas (formato colombiano con
 * separador de miles, campos ambiguos, etc.). Primitivas compartidas con
 * el perfil `contract_es` en `field-extraction-helpers.ts`.
 */
export function extractFields(ocrResult: OCRResult): ExtractedFields {
  return {
    proveedor: extractKeywordLineField(ocrResult, PROVEEDOR_KEYWORDS, /[A-Za-z]{3,}/),
    nit: extractStringField(ocrResult, NIT_PATTERN, NIT_KEYWORDS),
    fecha: extractStringField(ocrResult, FECHA_PATTERN, FECHA_KEYWORDS),
    iva: extractMoneyField(ocrResult, IVA_KEYWORDS),
    valor: extractMoneyField(ocrResult, VALOR_KEYWORDS),
    total: extractMoneyField(ocrResult, TOTAL_KEYWORDS),
    rawOCR: ocrResult.rawText,
    extractionMethod: "pattern",
  };
}
