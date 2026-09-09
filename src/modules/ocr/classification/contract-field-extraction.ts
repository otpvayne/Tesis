import type { OCRResult } from "@/modules/ocr/pipeline/ocr-pipeline";
import { type ExtractedField, extractKeywordLineField, extractMoneyField, extractStringField } from "@/modules/ocr/classification/field-extraction-helpers";

export interface ExtractedContractFields {
  proveedor: ExtractedField<string>;
  identificacion: ExtractedField<string>;
  fecha: ExtractedField<string>;
  valorTotal: ExtractedField<number>;
  vigencia: ExtractedField<string>;
  tipoContrato: ExtractedField<string>;
  numeroContrato: ExtractedField<string>;
  rawOCR: string;
  extractionMethod: "pattern";
}

/** NIT con guión (facturas) o cédula (solo dígitos, personas naturales) -- un contrato puede identificar a cualquiera de los dos. */
const IDENTIFICACION_PATTERN = /\d{1,3}\.\d{3}\.\d{3}-\d{1}|\d{6,11}/g;
const FECHA_PATTERN = /\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{4}/g;
const NUMERO_CONTRATO_PATTERN = /[A-Za-z]{0,4}-?\d{2,10}(?:-\d{1,6})?/g;

const PROVEEDOR_KEYWORDS = ["Proveedor", "Contratante", "Contratista", "Arrendador", "Arrendatario"];
const IDENTIFICACION_KEYWORDS = ["NIT", "N.I.T", "C.C", "Cédula", "Cedula", "Identificación", "Identificacion"];
const FECHA_KEYWORDS = ["Fecha", "Suscrito", "Suscrito el", "Firmado"];
const VALOR_TOTAL_KEYWORDS = ["Valor total", "Valor del contrato", "Valor"];
const VIGENCIA_KEYWORDS = ["Vigencia"];
const TIPO_CONTRATO_KEYWORDS = ["Tipo de contrato", "Contrato de"];
const NUMERO_CONTRATO_KEYWORDS = ["Número de contrato", "Numero de contrato", "No. Contrato", "Contrato No", "Contrato N°"];

/**
 * Extracción de campos para el perfil `contract_es` (RF-003 ampliado, ver
 * `docs/decisions/0003-perfil-ocr-contratos.md`) — mismo patrón
 * regex+keywords+3 niveles de confianza que `field-extraction.ts`
 * (`invoice_es`), reusando las primitivas de
 * `field-extraction-helpers.ts`. **No verificado todavía contra contratos
 * reales** (no existe dataset de contratos etiquetado) — las keywords y
 * patrones son un punto de partida razonable, no un resultado medido; se
 * ajustan cuando el equipo tenga contratos reales de Mansor para probar,
 * mismo criterio de honestidad que el resto del proyecto.
 */
export function extractContractFields(ocrResult: OCRResult): ExtractedContractFields {
  return {
    proveedor: extractKeywordLineField(ocrResult, PROVEEDOR_KEYWORDS, /[A-Za-z]{3,}/),
    identificacion: extractStringField(ocrResult, IDENTIFICACION_PATTERN, IDENTIFICACION_KEYWORDS),
    fecha: extractStringField(ocrResult, FECHA_PATTERN, FECHA_KEYWORDS),
    valorTotal: extractMoneyField(ocrResult, VALOR_TOTAL_KEYWORDS),
    vigencia: extractKeywordLineField(ocrResult, VIGENCIA_KEYWORDS),
    tipoContrato: extractKeywordLineField(ocrResult, TIPO_CONTRATO_KEYWORDS),
    numeroContrato: extractStringField(ocrResult, NUMERO_CONTRATO_PATTERN, NUMERO_CONTRATO_KEYWORDS),
    rawOCR: ocrResult.rawText,
    extractionMethod: "pattern",
  };
}
