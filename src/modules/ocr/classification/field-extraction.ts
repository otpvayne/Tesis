import type { OCRLine, OCRResult } from "@/modules/ocr/pipeline/ocr-pipeline";

export interface SourceRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ExtractedField<T> {
  value: T | null;
  confidence: number;
  sourceRegion: SourceRegion | null;
}

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
const MONEY_PATTERN = /\d+[.,]\d{2}/g;

const NIT_KEYWORDS = ["NIT", "N.I.T"];
const FECHA_KEYWORDS = ["Fecha", "Emisión", "Emision", "Date"];
const IVA_KEYWORDS = ["IVA", "Impuesto"];
const VALOR_KEYWORDS = ["Valor", "Subtotal"];
const TOTAL_KEYWORDS = ["Total"];
const PROVEEDOR_KEYWORDS = ["Proveedor", "Emisor", "Razón Social", "Razon Social", "Señor", "Senor"];

/**
 * Qué tan lejos (en caracteres, dentro del texto reconstruido) puede estar
 * el fin de una keyword del inicio del valor para considerarlo "adyacente"
 * — cubre separadores típicos (`: `, `. `, varios espacios) sin ser tan
 * amplio que enganche el valor de OTRO campo cercano (ver nota de diseño
 * más abajo).
 */
const ADJACENT_WINDOW = 15;

interface FieldMatch {
  raw: string;
  confidence: number;
  index: number;
}

/**
 * Todas las posiciones (fin de match, offset en `text`) donde aparece
 * alguna de `keywords`, con límite de palabra (`\b`) — sin esto, buscar
 * "Total" encontraría también la "total" dentro de "Subtotal", confundiendo
 * el campo `total` con el campo `valor`.
 */
function findKeywordEnds(text: string, keywords: string[]): number[] {
  const ends: number[] = [];
  for (const keyword of keywords) {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escaped}\\b`, "gi");
    for (const match of text.matchAll(regex)) {
      ends.push(match.index + match[0].length);
    }
  }
  return ends;
}

/**
 * Busca el mejor candidato para un campo con patrón regex + keywords,
 * en 3 niveles de confianza:
 *
 * 1. **0.95** — el candidato está inmediatamente después de una keyword
 *    del campo (dentro de `ADJACENT_WINDOW` caracteres). Es la señal más
 *    fuerte: "IVA 234.56" o "Total: 1468.12".
 * 2. **0.7** — la keyword aparece en algún lugar del texto, pero ningún
 *    candidato está pegado a ella; se toma el candidato numéricamente más
 *    cercano (por posición) a cualquier aparición de la keyword —
 *    ambigüedad real, no un acierto limpio.
 * 3. **0.5** — la keyword no aparece en absoluto; se toma el primer
 *    candidato que matchea el patrón en todo el texto, como conjetura.
 *
 * Si no hay ningún candidato que matchee el patrón, retorna `null` (campo
 * no encontrado — manejo explícito, no se inventa un valor).
 *
 * **Por qué no una sola ventana de contexto simétrica** (`texto[i-50, i+50]`,
 * el diseño original propuesto): con varios campos monetarios cercanos en
 * un bloque de texto corto (ej. "IVA 234.56\nValor 1234.56\nTotal
 * 1468.12" cabe entera en una ventana de ±50), una ventana simétrica ancha
 * hace que la keyword de un campo aparezca también en la ventana de los
 * *otros* números, y como el criterio de desempate no reemplaza en
 * empates, los tres campos terminarían devolviendo el mismo primer
 * número. Buscar el candidato **inmediatamente después** de la keyword
 * (no "en algún lugar cerca") asocia cada valor con su propia etiqueta
 * incluso cuando varios campos comparten el mismo patrón regex.
 */
function findBestMatch(text: string, pattern: RegExp, keywords: string[]): FieldMatch | null {
  const matches = Array.from(text.matchAll(pattern));
  if (matches.length === 0) return null;

  const keywordEnds = findKeywordEnds(text, keywords);

  for (const match of matches) {
    const start = match.index;
    const isAdjacent = keywordEnds.some((end) => start >= end && start - end <= ADJACENT_WINDOW);
    if (isAdjacent) {
      return { raw: match[0], confidence: 0.95, index: start };
    }
  }

  if (keywordEnds.length > 0) {
    let best = matches[0];
    let bestDistance = Infinity;
    for (const match of matches) {
      for (const end of keywordEnds) {
        const distance = Math.abs(match.index - end);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = match;
        }
      }
    }
    return { raw: best[0], confidence: 0.7, index: best.index };
  }

  return { raw: matches[0][0], confidence: 0.5, index: matches[0].index };
}

/** Ubica qué línea de `ocrResult.lines` contiene el offset `index` de `ocrResult.rawText` (unidas con "\n"), para reportar `sourceRegion` a nivel de línea (no de carácter — ver `docs/ocr/extraction.md`). */
function lineAtIndex(lines: OCRLine[], index: number): OCRLine | null {
  let offset = 0;
  for (const line of lines) {
    const end = offset + line.text.length;
    if (index >= offset && index <= end) return line;
    offset = end + 1; // +1 por el separador "\n"
  }
  return null;
}

function sourceRegionOf(line: OCRLine | null): SourceRegion | null {
  if (!line) return null;
  return { x: line.bbox.x, y: line.bbox.y, w: line.bbox.width, h: line.bbox.height };
}

function extractStringField(ocrResult: OCRResult, pattern: RegExp, keywords: string[]): ExtractedField<string> {
  const match = findBestMatch(ocrResult.rawText, pattern, keywords);
  if (!match) return { value: null, confidence: 0, sourceRegion: null };
  return {
    value: match.raw,
    confidence: match.confidence,
    sourceRegion: sourceRegionOf(lineAtIndex(ocrResult.lines, match.index)),
  };
}

function extractMoneyField(ocrResult: OCRResult, keywords: string[]): ExtractedField<number> {
  const match = findBestMatch(ocrResult.rawText, MONEY_PATTERN, keywords);
  if (!match) return { value: null, confidence: 0, sourceRegion: null };
  return {
    value: parseFloat(match.raw.replace(",", ".")),
    confidence: match.confidence,
    sourceRegion: sourceRegionOf(lineAtIndex(ocrResult.lines, match.index)),
  };
}

/**
 * `proveedor` no tiene un patrón regex (es un nombre, no un número/fecha)
 * — se busca la keyword seguida del resto de esa misma línea; si ninguna
 * keyword aparece, se usa como conjetura la primera línea reconocida que
 * tenga al menos 3 letras seguidas (para no devolver una línea que sea
 * solo un NIT o una fecha).
 */
function extractProveedor(ocrResult: OCRResult): ExtractedField<string> {
  for (const line of ocrResult.lines) {
    for (const keyword of PROVEEDOR_KEYWORDS) {
      const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const match = new RegExp(`\\b${escaped}\\b\\s*[:.]?\\s*`, "i").exec(line.text);
      if (match) {
        const rest = line.text.slice(match.index + match[0].length).trim();
        if (rest.length > 0) {
          return { value: rest, confidence: 0.9, sourceRegion: sourceRegionOf(line) };
        }
      }
    }
  }

  const fallback = ocrResult.lines.find((line) => /[A-Za-z]{3,}/.test(line.text));
  if (fallback) {
    return { value: fallback.text, confidence: 0.5, sourceRegion: sourceRegionOf(fallback) };
  }

  return { value: null, confidence: 0, sourceRegion: null };
}

/**
 * Extracción de campos de RF-003 por regex + keywords — heurística, no ML
 * (`CLAUDE.md` §7 solo prohíbe ML/CV de terceros para el *reconocimiento*
 * de caracteres; esto opera sobre texto ya reconocido). Ver
 * `docs/ocr/extraction.md` para el detalle de cada patrón, las razones de
 * las 3 confidences y limitaciones conocidas (formato colombiano con
 * separador de miles, campos ambiguos, etc.).
 */
export function extractFields(ocrResult: OCRResult): ExtractedFields {
  return {
    proveedor: extractProveedor(ocrResult),
    nit: extractStringField(ocrResult, NIT_PATTERN, NIT_KEYWORDS),
    fecha: extractStringField(ocrResult, FECHA_PATTERN, FECHA_KEYWORDS),
    iva: extractMoneyField(ocrResult, IVA_KEYWORDS),
    valor: extractMoneyField(ocrResult, VALOR_KEYWORDS),
    total: extractMoneyField(ocrResult, TOTAL_KEYWORDS),
    rawOCR: ocrResult.rawText,
    extractionMethod: "pattern",
  };
}
