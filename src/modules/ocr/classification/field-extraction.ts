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

/**
 * NIT colombiano: formato punteado con dígito de verificación
 * (`900.123.456-7`), o una tira de 9-11 dígitos con el dígito de
 * verificación separado por guión O por espacio — Tesseract.js a veces
 * reconoce el guión del NIT como un espacio (glifos muy parecidos en
 * fuentes pequeñas/factura escaneada), caso real encontrado probando con
 * facturas de Mansor (2026-09-08) — sin esta segunda alternativa, el
 * dígito de verificación se perdía silenciosamente.
 */
const NIT_PATTERN = /\d{1,3}\.\d{3}\.\d{3}-\d{1}|\d{9,10}[\s-]\d{1}|\d{9,11}/g;
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
 * las 3 confidences y limitaciones conocidas (campos ambiguos, Proveedor
 * sin heurística robusta, etc. — el formato colombiano con separador de
 * miles ya se corrigió, ver §7 de ese doc). Primitivas compartidas con
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
