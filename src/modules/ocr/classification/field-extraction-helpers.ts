import type { OCRLine, OCRResult } from "@/modules/ocr/pipeline/ocr-pipeline";

/**
 * Primitivas compartidas de extracción de campos por regex + keywords
 * (heurística sobre texto ya reconocido, `CLAUDE.md` §7 solo prohíbe
 * ML/CV de terceros para el *reconocimiento* de caracteres). Extraídas de
 * `field-extraction.ts` (perfil `invoice_es`) para que
 * `contract-field-extraction.ts` (perfil `contract_es`) las reuse sin
 * duplicar la lógica de 3 niveles de confianza ni el manejo de líneas.
 */

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

/**
 * Qué tan lejos (en caracteres, dentro del texto reconstruido) puede estar
 * el fin de una keyword del inicio del valor para considerarlo "adyacente"
 * — cubre separadores típicos (`: `, `. `, varios espacios) sin ser tan
 * amplio que enganche el valor de OTRO campo cercano.
 */
export const ADJACENT_WINDOW = 15;

export interface FieldMatch {
  raw: string;
  confidence: number;
  index: number;
}

/**
 * Todas las posiciones (fin de match, offset en `text`) donde aparece
 * alguna de `keywords`, con límite de palabra (`\b`) — sin esto, buscar
 * "Total" encontraría también la "total" dentro de "Subtotal".
 */
export function findKeywordEnds(text: string, keywords: string[]): number[] {
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
 * Busca el mejor candidato para un campo con patrón regex + keywords, en 3
 * niveles de confianza:
 *
 * 1. **0.95** — el candidato está inmediatamente después de una keyword
 *    del campo (dentro de `ADJACENT_WINDOW` caracteres).
 * 2. **0.7** — la keyword aparece en algún lugar del texto, pero ningún
 *    candidato está pegado a ella; se toma el candidato numéricamente más
 *    cercano (por posición) a cualquier aparición de la keyword.
 * 3. **0.5** — la keyword no aparece en absoluto; se toma el primer
 *    candidato que matchea el patrón en todo el texto, como conjetura.
 *
 * Si no hay ningún candidato que matchee el patrón, retorna `null` (campo
 * no encontrado — manejo explícito, no se inventa un valor).
 */
export function findBestMatch(text: string, pattern: RegExp, keywords: string[]): FieldMatch | null {
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

/** Ubica qué línea de `ocrResult.lines` contiene el offset `index` de `ocrResult.rawText` (unidas con "\n"), para reportar `sourceRegion` a nivel de línea. */
export function lineAtIndex(lines: OCRLine[], index: number): OCRLine | null {
  let offset = 0;
  for (const line of lines) {
    const end = offset + line.text.length;
    if (index >= offset && index <= end) return line;
    offset = end + 1; // +1 por el separador "\n"
  }
  return null;
}

export function sourceRegionOf(line: OCRLine | null): SourceRegion | null {
  if (!line) return null;
  return { x: line.bbox.x, y: line.bbox.y, w: line.bbox.width, h: line.bbox.height };
}

export function extractStringField(ocrResult: OCRResult, pattern: RegExp, keywords: string[]): ExtractedField<string> {
  const match = findBestMatch(ocrResult.rawText, pattern, keywords);
  if (!match) return { value: null, confidence: 0, sourceRegion: null };
  return {
    value: match.raw,
    confidence: match.confidence,
    sourceRegion: sourceRegionOf(lineAtIndex(ocrResult.lines, match.index)),
  };
}

const MONEY_PATTERN = /\d+[.,]\d{2}/g;

export function extractMoneyField(ocrResult: OCRResult, keywords: string[]): ExtractedField<number> {
  const match = findBestMatch(ocrResult.rawText, MONEY_PATTERN, keywords);
  if (!match) return { value: null, confidence: 0, sourceRegion: null };
  return {
    value: parseFloat(match.raw.replace(",", ".")),
    confidence: match.confidence,
    sourceRegion: sourceRegionOf(lineAtIndex(ocrResult.lines, match.index)),
  };
}

/**
 * Campo sin patrón regex propio (un nombre, un tipo, una duración en
 * texto libre) — se busca una de `keywords` seguida del resto de esa
 * misma línea; si ninguna keyword aparece y se da `fallbackPattern`, se
 * usa como conjetura (confidence 0.5) la primera línea reconocida que
 * matchee ese patrón.
 */
export function extractKeywordLineField(ocrResult: OCRResult, keywords: string[], fallbackPattern?: RegExp): ExtractedField<string> {
  for (const line of ocrResult.lines) {
    for (const keyword of keywords) {
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

  if (fallbackPattern) {
    const fallback = ocrResult.lines.find((line) => fallbackPattern.test(line.text));
    if (fallback) {
      return { value: fallback.text, confidence: 0.5, sourceRegion: sourceRegionOf(fallback) };
    }
  }

  return { value: null, confidence: 0, sourceRegion: null };
}
