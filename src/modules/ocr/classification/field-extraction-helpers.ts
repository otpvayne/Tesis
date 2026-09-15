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
 *
 * Ampliado de 15 a 20 (2026-09-15, factura real de Mansor -- Ferretería
 * Danimar): con 15, "TOTAL DE LA OPERACIÓN 24.750" (18 caracteres entre el
 * fin de "Total" y el inicio del monto, por el resto de la etiqueta) caía
 * FUERA de la ventana y el campo `total` bajaba a confidence 0.7 en vez de
 * 0.95, aunque igual acertaba el valor por el criterio de distancia. 20 es
 * suficiente para esa etiqueta larga sin volverse tan amplio como para
 * cruzar a la fila de la tabla de ítems (ver el fix de
 * `isPrecededByLetter`/mínimo de dígitos abajo, que es el que de verdad
 * evita esa contaminación).
 */
export const ADJACENT_WINDOW = 20;

export interface FieldMatch {
  raw: string;
  confidence: number;
  index: number;
}

/**
 * Construye el regex de un keyword con límite de palabra (`\b`) — sin esto,
 * buscar "Total" encontraría también la "total" dentro de "Subtotal". `\b`
 * solo es una transición válida entre un carácter de palabra y uno que no
 * lo es: si el keyword empieza o termina en un símbolo (p. ej. "Contrato
 * N°"), un `\b` fijo en ese extremo nunca matchea cuando el símbolo está
 * seguido de otro no-palabra (un espacio, lo más común en texto real) —
 * bug encontrado verificando `contract-field-extraction.ts` antes de tener
 * contratos reales para probar. Se agrega `\b` en cada extremo solo cuando
 * ese extremo del keyword es realmente un carácter de palabra.
 */
export function buildKeywordRegex(keyword: string, flags: string): RegExp {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const startBoundary = /^\w/.test(keyword) ? "\\b" : "";
  const endBoundary = /\w$/.test(keyword) ? "\\b" : "";
  return new RegExp(`${startBoundary}${escaped}${endBoundary}`, flags);
}

/**
 * Todas las posiciones (fin de match, offset en `text`) donde aparece
 * alguna de `keywords`.
 */
export function findKeywordEnds(text: string, keywords: string[]): number[] {
  const ends: number[] = [];
  for (const keyword of keywords) {
    const regex = buildKeywordRegex(keyword, "gi");
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

/**
 * Monto en pesos colombianos: NUNCA tiene centavos de uso práctico, y el
 * separador de MILES (`.` en el formato real, aunque ver más abajo por
 * qué también se acepta `,`) no es un decimal (`71.000` = 71.000 pesos,
 * no 71.00). Antes este patrón asumía formato de dólares (`\d+[.,]\d{2}`,
 * exactamente 2 decimales) — bug real encontrado probando con facturas
 * reales de Mansor (2026-09-08): a "11.334" (COP) le extraía "11.33"
 * (le comía el último dígito), y a "71.000" le extraía "71.00"
 * (perdía el cero final) porque el patrón exigía exactamente 2 dígitos
 * tras el separador. Afectaba a IVA/Valor/Total de `invoice_es` y a
 * Valor total de `contract_es` por igual, porque ambos perfiles
 * comparten `extractMoneyField` — no era un problema de reconocimiento
 * de caracteres, sino de cómo se interpretaba el texto ya reconocido.
 *
 * **Segundo bug real, distinto, encontrado el 2026-09-15 con una factura
 * real de Ferretería Danimar** (Andrés reportó que volvía a salir "1" en
 * IVA/Valor/Total): la tabla de ítems repite las mismas palabras que se
 * buscan como keyword -- el encabezado dice literalmente
 * "... | IVA | Valor IVA Total" y la fila 1 empieza inmediatamente
 * después con el NÚMERO DE FILA ("1 E141 [ESCUADRA..."). Con la ventana
 * de `ADJACENT_WINDOW` original, ese "1" caía pegado al keyword del
 * encabezado y ganaba por sobre el valor real (que está más abajo, en la
 * sección de totales). Dos causas concretas, dos fixes:
 *
 * 1. Un candidato de 1-2 dígitos sueltos (el número de fila, o una
 *    cantidad como "10") casi nunca es un monto real de IVA/Valor/Total
 *    -- se sube el mínimo de la alternativa sin separador de `\d+` a
 *    `\d{3,}`.
 * 2. Un candidato pegado a una LETRA (p. ej. "141" dentro del código de
 *    producto "E141") tampoco es un monto -- es un dígito que quedó
 *    "adentro" de otro token. Se agrega `(?<![A-Za-zÀ-ÿ])` justo antes de
 *    cada alternativa numérica (no antes del `$`/espacio opcional, que sí
 *    puede preceder un monto real) para excluirlo.
 *
 * **Tercer detalle, mismo caso real:** la sección de totales de esa misma
 * factura trae "IVA 3,952" con COMA en vez de punto -- el OCR confundió
 * los dos glifos (frecuente en escaneos de baja resolución), pero el
 * resto de la misma factura sí usa punto ("SUBTOTAL 20.798",
 * "TOTAL ... 24.750"). Si se interpreta la coma siempre como decimal
 * (como antes), "3,952" se leía "3,95" (perdía el último dígito) en vez
 * de 3952. Ahora CUALQUIERA de los dos separadores (`.`/`,`) se acepta
 * como separador de miles cuando agrupa exactamente 3 dígitos, y como
 * decimal solo cuando quedan 1-2 dígitos sueltos al final -- así no
 * importa cuál de los dos glifos reconoció el OCR.
 */
const MONEY_PATTERN =
  /\$?\s?(?<![A-Za-zÀ-ÿ])\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\$?\s?(?<![A-Za-zÀ-ÿ])\d{3,}(?:[.,]\d{1,2})?/g;

/**
 * Convierte el texto ya emparejado por `MONEY_PATTERN` a un número real:
 * quita `$`/espacios, quita los separadores de MILES (grupos de
 * exactamente 3 dígitos -- no son decimales en formato colombiano, ver
 * comentario de `MONEY_PATTERN` sobre por qué se acepta tanto `.` como
 * `,` como separador de miles), y solo entonces normaliza el separador
 * decimal que haya quedado (si lo hay, 1-2 dígitos) a punto para que
 * `parseFloat` lo entienda. Separada de `extractMoneyField` para poder
 * testear la conversión numérica sola, sin pasar por `findBestMatch`.
 */
export function parseColombianMoney(raw: string): number {
  const withoutThousands = raw.replace(/[$\s]/g, "").replace(/[.,](?=\d{3})/g, "");
  return parseFloat(withoutThousands.replace(/[.,]/, "."));
}

export function extractMoneyField(ocrResult: OCRResult, keywords: string[]): ExtractedField<number> {
  const match = findBestMatch(ocrResult.rawText, MONEY_PATTERN, keywords);
  if (!match) return { value: null, confidence: 0, sourceRegion: null };
  return {
    value: parseColombianMoney(match.raw),
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
      const keywordRegex = buildKeywordRegex(keyword, "i");
      const match = new RegExp(`${keywordRegex.source}\\s*[:.]?\\s*`, "i").exec(line.text);
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
