import type { OCRLine, OCRResult } from "@/modules/ocr/pipeline/ocr-pipeline";
import {
  type ExtractedField,
  extractKeywordLineField,
  extractMoneyField,
  extractStringField,
  sourceRegionOf,
} from "@/modules/ocr/classification/field-extraction-helpers";

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
 * Frases de relleno tributario que casi siempre aparecen ENTRE el nombre
 * real de la empresa y su NIT en una factura electrónica colombiana --
 * nunca son el nombre en sí. Se comprueba solo al INICIO de la línea (no
 * en cualquier parte): a veces el OCR fusiona la línea del nombre real
 * con la primera de estas por segmentación de línea imperfecta (caso real
 * -- "FERRETERIA EJEMPLO SAS IVA Régimen Común No somos Agentes..." es
 * una sola línea reconstruida que empieza con el nombre real), y esa
 * línea SÍ debe aceptarse como candidata (`trimAfterCompanySuffix` limpia
 * el relleno del final después) -- solo se descarta una línea que sea
 * puro relleno de principio a fin. Lista de partida, no exhaustiva -- se
 * amplía cuando aparezcan más facturas reales con frases nuevas.
 */
const PROVEEDOR_NOISE_PHRASES = ["no somos", "responsable del iva", "régimen", "regimen", "actividad económica", "actividad economica", "grandes contribuyentes", "gran contribuyente", "autorretenedor"];

function isNoiseLine(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  return PROVEEDOR_NOISE_PHRASES.some((phrase) => normalized.startsWith(phrase));
}

/**
 * Sufijo de razón social colombiana (SAS, S.A.S., LTDA, S.A., E.U.) --
 * cuando aparece, todo lo que sigue en la misma línea casi seguro es
 * relleno (razón tributaria, dirección, etc. que el OCR fusionó en la
 * misma línea), así que se recorta ahí. Si no aparece (p. ej. el OCR
 * reconoció mal alguna letra del sufijo, caso real encontrado en una
 * factura -- "S.A.S." salió como "5.A.S."), se deja la línea tal cual en
 * vez de inventar un corte -- mejor una línea con ruido visible que una
 * recortada mal.
 */
const COMPANY_SUFFIX_PATTERN = /\b(?:S\.?A\.?S\.?|LTDA\.?|S\.?A\.?|E\.?U\.?)\b/i;

function trimAfterCompanySuffix(text: string): string {
  const match = COMPANY_SUFFIX_PATTERN.exec(text);
  if (!match) return text.trim();
  return text.slice(0, match.index + match[0].length).trim();
}

/**
 * Heurística nueva (2026-09-15, dos facturas reales de proveedores de
 * Mansor -- ninguna de las dos trae ninguna keyword de
 * `PROVEEDOR_KEYWORDS`, así que sin esto el campo caía siempre al
 * fallback ciego de "primera línea con letras", que en la práctica agarra
 * el título del documento ("Factura Electrónica de Venta...") en vez del
 * nombre real): en ambas facturas, el nombre de la empresa está en la
 * línea INMEDIATAMENTE ARRIBA de su propio NIT -- el primero que aparece
 * en el documento (el del cliente, que en este proyecto siempre es
 * Mansor, aparece después, junto a la palabra "CLIENTE"). Se camina hacia
 * atrás desde esa línea (máximo 5, para no terminar leyendo el
 * encabezado de otra sección si el documento no sigue el patrón) saltando
 * líneas de puro relleno tributario (`containsNoisePhrase`) o sin
 * suficiente contenido, hasta encontrar una candidata real.
 *
 * Sigue siendo una heurística POSICIONAL, no una etiqueta confirmada --
 * confidence 0.6, entre la keyword explícita (0.9) y el fallback ciego
 * (0.5). El equipo debe seguir mandando facturas reales de proveedores
 * distintos para confirmar que el patrón se sostiene, no solo con dos
 * casos (honestidad de datos, mismo criterio que el resto del proyecto).
 */
function findProveedorNearNit(ocrResult: OCRResult): ExtractedField<string> | null {
  const nitPattern = new RegExp(NIT_PATTERN.source, NIT_PATTERN.flags.replace("g", ""));
  const nitLineIndex = ocrResult.lines.findIndex((line) => nitPattern.test(line.text));
  if (nitLineIndex <= 0) return null;

  const MAX_LOOKBACK = 5;
  for (let i = nitLineIndex - 1; i >= 0 && i >= nitLineIndex - MAX_LOOKBACK; i--) {
    const line: OCRLine = ocrResult.lines[i];
    const text = line.text.trim();
    if (isNoiseLine(text)) continue;
    if (!/[A-Za-zÀ-ÿ]{3,}/.test(text)) continue; // sin suficientes letras, no es un nombre (símbolos sueltos, ruido de OCR)
    return { value: trimAfterCompanySuffix(text), confidence: 0.6, sourceRegion: sourceRegionOf(line) };
  }
  return null;
}

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
  const proveedorByKeyword = extractKeywordLineField(ocrResult, PROVEEDOR_KEYWORDS);
  const proveedor = proveedorByKeyword.value
    ? { ...proveedorByKeyword, value: trimAfterCompanySuffix(proveedorByKeyword.value) }
    : (findProveedorNearNit(ocrResult) ?? extractKeywordLineField(ocrResult, [], /[A-Za-z]{3,}/));

  return {
    proveedor,
    nit: extractStringField(ocrResult, NIT_PATTERN, NIT_KEYWORDS),
    fecha: extractStringField(ocrResult, FECHA_PATTERN, FECHA_KEYWORDS),
    iva: extractMoneyField(ocrResult, IVA_KEYWORDS),
    valor: extractMoneyField(ocrResult, VALOR_KEYWORDS),
    total: extractMoneyField(ocrResult, TOTAL_KEYWORDS),
    rawOCR: ocrResult.rawText,
    extractionMethod: "pattern",
  };
}
