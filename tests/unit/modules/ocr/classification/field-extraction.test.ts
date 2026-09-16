import { describe, expect, it } from "vitest";
import { extractFields } from "@/modules/ocr/classification/field-extraction";
import type { OCRLine, OCRResult } from "@/modules/ocr/pipeline/ocr-pipeline";

function makeLine(text: string, y: number): OCRLine {
  return { text, bbox: { x: 5, y, width: text.length * 8, height: 20 }, confidence: 0.9 };
}

function makeOCRResult(lines: string[]): OCRResult {
  const ocrLines = lines.map((text, i) => makeLine(text, i * 25));
  return {
    rawText: ocrLines.map((l) => l.text).join("\n"),
    confidence: 0.9,
    lines: ocrLines,
    processedAt: new Date(),
    timingMs: { preprocess: 0, segmentation: 0, recognition: 0, total: 0 },
  };
}

describe("extractFields", () => {
  /**
   * Formato colombiano real (no dólares): el punto es separador de MILES,
   * los pesos no tienen centavos de uso práctico. Antes de 2026-09-08 estos
   * casos usaban formato de dólares ("234.56" con exactamente 2 decimales)
   * porque nadie había probado el pipeline contra una factura colombiana
   * real todavía — al hacerlo (integración de Tesseract.js), se encontró
   * que ese formato le hacía perder dígitos a montos reales
   * (`docs/ocr/extraction.md` §7 documenta el hallazgo). Se corrigieron
   * aquí para reflejar el formato real del dominio (RF-003, "facturación
   * colombiana"), no el de la especificación original de ejemplo.
   */
  it("caso claro (formato colombiano): todos los campos con confidence 0.95", () => {
    const ocrResult = makeOCRResult([
      "NIT 123456789",
      "Fecha 12/08/2025",
      "IVA 234.000",
      "Valor 1.234.000",
      "Total 1.468.000",
    ]);

    const fields = extractFields(ocrResult);

    expect(fields.nit).toMatchObject({ value: "123456789", confidence: 0.95 });
    expect(fields.fecha).toMatchObject({ value: "12/08/2025", confidence: 0.95 });
    expect(fields.iva).toMatchObject({ value: 234000, confidence: 0.95 });
    expect(fields.valor).toMatchObject({ value: 1234000, confidence: 0.95 });
    expect(fields.total).toMatchObject({ value: 1468000, confidence: 0.95 });
    expect(fields.extractionMethod).toBe("pattern");
    expect(fields.rawOCR).toBe(ocrResult.rawText);
  });

  it("no confunde 'Total' con la 'total' dentro de 'Subtotal'", () => {
    const ocrResult = makeOCRResult(["Subtotal 500.000", "Total 650.000"]);
    const fields = extractFields(ocrResult);

    expect(fields.valor).toMatchObject({ value: 500000, confidence: 0.95 });
    expect(fields.total).toMatchObject({ value: 650000, confidence: 0.95 });
  });

  it("NIT con formato punteado (XXX.XXX.XXX-X)", () => {
    const ocrResult = makeOCRResult(["NIT 900.123.456-7"]);
    const fields = extractFields(ocrResult);
    expect(fields.nit.value).toBe("900.123.456-7");
  });

  it("NIT con el guión reconocido como espacio (glifo confundible en OCR) — caso real encontrado con Tesseract.js sobre factura de Mansor", () => {
    const ocrResult = makeOCRResult(["NIT 900341337 4"]);
    const fields = extractFields(ocrResult);
    expect(fields.nit.value).toBe("900341337 4");
  });

  it("bug real corregido: monto en pesos colombianos NO pierde dígitos por el punto de miles (antes '11.334' -> 11.33, ahora -> 11334)", () => {
    const ocrResult = makeOCRResult(["IVA 11.334", "Valor 71.000", "Total 150000"]);
    const fields = extractFields(ocrResult);

    expect(fields.iva).toMatchObject({ value: 11334, confidence: 0.95 });
    expect(fields.valor).toMatchObject({ value: 71000, confidence: 0.95 });
    // Total sin puntos de miles en absoluto (OCR no los reconoció como
    // caracteres separados) -- debe seguir extrayendo el monto completo.
    expect(fields.total).toMatchObject({ value: 150000, confidence: 0.95 });
  });

  it("monto con decimales reales tras coma (caso raro pero válido: '11.334,50')", () => {
    const ocrResult = makeOCRResult(["Valor 11.334,50"]);
    const fields = extractFields(ocrResult);
    expect(fields.valor.value).toBeCloseTo(11334.5, 5);
  });

  it("monto con símbolo de peso ('$71.000')", () => {
    const ocrResult = makeOCRResult(["Total $71.000"]);
    const fields = extractFields(ocrResult);
    expect(fields.total.value).toBe(71000);
  });

  it("proveedor: keyword seguida del nombre en la misma línea", () => {
    // "Emisor:" y no "Proveedor:" -- ver el comentario de PROVEEDOR_KEYWORDS
    // en field-extraction.ts sobre por qué "Proveedor" se sacó de la lista
    // (factura real, 2026-09-15: la palabra "Proveedor" solo aparece en el
    // disclaimer obligatorio de la DIAN "Fabricante y Proveedor
    // Tecnológico", nunca como etiqueta del nombre real de la empresa).
    const ocrResult = makeOCRResult(["Emisor: Acme Suministros SAS", "NIT 900123456"]);
    const fields = extractFields(ocrResult);
    expect(fields.proveedor).toMatchObject({ value: "Acme Suministros SAS", confidence: 0.9 });
  });

  /**
   * Tercer bug real reportado por Andrés el mismo día, sobre la misma
   * segunda factura: el campo seguía saliendo mal, esta vez con
   * "Tecnológico: World Office Colombia SAS" -- el nombre del PROVEEDOR
   * TECNOLÓGICO (la empresa de software que generó la factura electrónica),
   * no el de la empresa que realmente la emite. Toda factura electrónica
   * colombiana (DIAN) trae, por obligación normativa, una línea fija
   * "Fabricante y Proveedor Tecnológico: <software>..." -- como
   * `extractKeywordLineField` recorre el documento desde el principio y la
   * keyword "Proveedor" existía en la lista, esa línea (aunque está casi al
   * final del documento) ganaba con confidence 0.9 sobre cualquier otra
   * heurística. Confirmado en LAS DOS facturas reales de esta sesión (mismo
   * software, misma línea textual) -- no es un caso aislado de un solo
   * documento, así que la palabra "Proveedor" se sacó de
   * `PROVEEDOR_KEYWORDS` (ver ese comentario). Nombre del software
   * ficticio, aunque el texto del disclaimer en sí es el mismo en ambas
   * facturas reales (frase estándar de la DIAN, no dato privado de un
   * proveedor de Mansor).
   */
  it("no confunde el 'Proveedor Tecnológico' (disclaimer obligatorio de la DIAN, casi siempre al final del documento) con el nombre real de la empresa que emite la factura", () => {
    const ocrResult = makeOCRResult([
      "» DISTRIBUIDORA EJEMPLO 5.A.S. ACME",
      "Nit. 900.564.101-0",
      "Responsable del IVA No somos Agentes de Retención de IVA",
      "No somos Grandes Contribuyentes Ni Autorretenedores",
      "SUBTOTAL 156.975",
      "IVA 29.825",
      "TOTAL DE LA OPERACION 186.800",
      "Fabricante y Proveedor Tecnológico: Software Ejemplo SAS NIT 900999888-1 Software: Software Ejemplo",
    ]);

    const fields = extractFields(ocrResult);

    expect(fields.proveedor).toMatchObject({ value: "» DISTRIBUIDORA EJEMPLO 5.A.S. ACME", confidence: 0.6 });
  });

  /**
   * Bug real encontrado probando `findProveedorNearNit` contra el texto OCR
   * COMPLETO de la primera factura (no solo el fragmento recortado del test
   * de arriba): buscar la primera línea que matchee el patrón de NIT a
   * secas encuentra una línea equivocada si el documento trae ANTES otro
   * número largo con pinta de NIT -- en ese caso concreto, el número de
   * autorización de facturación electrónica de la DIAN (14 dígitos, de los
   * cuales cualquier tira de 9-11 matchea la alternativa suelta del
   * patrón) aparece varias líneas antes del NIT real. Fix: exigir que la
   * línea tenga TAMBIÉN una keyword de NIT ("NIT"/"N.I.T") -- el número de
   * autorización nunca viene junto a esa palabra.
   */
  it("no confunde un número largo sin relación con el NIT (p. ej. un número de autorización de facturación) con la línea del NIT real", () => {
    const ocrResult = makeOCRResult([
      "Documento Oficial de Autorización de Numeración Facturación Electrónica No. 18764067245641",
      "EMPRESA EJEMPLO SAS Régimen Común No somos Agentes de Retención de IVA",
      "No somos Grandes Contribuyentes",
      "Nit 901147580 Actividad Económica ICA 4752",
    ]);

    const fields = extractFields(ocrResult);

    expect(fields.proveedor).toMatchObject({ value: "EMPRESA EJEMPLO SAS", confidence: 0.6 });
    expect(fields.nit.value).toBe("901147580");
  });

  it("proveedor: sin keyword, pero con una línea justo arriba del NIT -> usa esa línea (heurística posicional, confidence media)", () => {
    // Antes (sin la heurística de "línea arriba del NIT", agregada
    // 2026-09-15 con dos facturas reales) este mismo fixture caía al
    // fallback ciego "primera línea con letras" y daba confidence 0.5 --
    // ahora hay una explicación mejor (la línea SÍ está justo arriba del
    // NIT, patrón real observado), así que sube a 0.6. El valor no
    // cambia porque en este caso ambas heurísticas eligen la misma línea.
    const ocrResult = makeOCRResult(["Acme Suministros SAS", "NIT 900123456"]);
    const fields = extractFields(ocrResult);
    expect(fields.proveedor).toMatchObject({ value: "Acme Suministros SAS", confidence: 0.6 });
  });

  it("proveedor: sin keyword y sin NIT en el texto -> cae al fallback ciego, primera línea con letras (confidence baja)", () => {
    const ocrResult = makeOCRResult(["Acme Suministros SAS", "Documento sin NIT reconocible"]);
    const fields = extractFields(ocrResult);
    expect(fields.proveedor).toMatchObject({ value: "Acme Suministros SAS", confidence: 0.5 });
  });

  it("campo ambiguo: la keyword existe pero no está pegada al número -> confidence 0.7", () => {
    // "IVA" aparece, pero el numero que sigue esta a mas de ADJACENT_WINDOW
    // caracteres, y hay OTRO numero de por medio -- keyword no adyacente a ningun match
    const ocrResult = makeOCRResult(["IVA incluido en el precio total del documento: 234.567"]);
    const fields = extractFields(ocrResult);
    expect(fields.iva.value).toBe(234567);
    expect(fields.iva.confidence).toBe(0.7);
  });

  it("campo ausente: sin keyword ni patrón en el texto -> value null, confidence 0", () => {
    const ocrResult = makeOCRResult(["Documento sin datos reconocibles"]);
    const fields = extractFields(ocrResult);

    expect(fields.nit).toEqual({ value: null, confidence: 0, sourceRegion: null });
    expect(fields.fecha).toEqual({ value: null, confidence: 0, sourceRegion: null });
    expect(fields.iva).toEqual({ value: null, confidence: 0, sourceRegion: null });
  });

  it("campo con patrón pero sin keyword en absoluto -> confidence baja (0.5), toma el primer candidato", () => {
    // "550"/"990" (no "55.00"/"99.00" como antes 2026-09-15): el mínimo de
    // 3 dígitos que ahora exige la alternativa sin separador (ver
    // MONEY_PATTERN) haría que "55"/"99" ya no matcheen en absoluto -- este
    // test no busca probar formato de montos, solo la lógica de "sin
    // keyword, toma el primer candidato", así que se usan números que sí
    // siguen siendo candidatos válidos.
    const ocrResult = makeOCRResult(["algo 550 y despues 990, sin ninguna palabra clave"]);
    const fields = extractFields(ocrResult);
    // ninguna keyword de iva/valor/total aparece -> los 3 campos caen al
    // mismo primer candidato (550), confidence 0.5 -- limitación
    // documentada: sin keywords, no hay forma de distinguir los campos.
    expect(fields.iva).toMatchObject({ value: 550, confidence: 0.5 });
    expect(fields.valor).toMatchObject({ value: 550, confidence: 0.5 });
    expect(fields.total).toMatchObject({ value: 550, confidence: 0.5 });
  });

  /**
   * Bug real reportado por Andrés (2026-09-15) sobre una factura real de un
   * proveedor de Mansor: IVA, Valor y Total salían todos en "1". Causa: el
   * encabezado de la tabla de ítems repite literalmente las palabras que
   * se buscan ("... | IVA | Valor IVA Total"), y la fila 1 empieza justo
   * después con su NÚMERO DE FILA ("1 P001 [HERRAMIENTA UNO...") -- ese "1"
   * quedaba pegado al keyword del encabezado y ganaba sobre el valor real,
   * que está más abajo en la sección de totales. Reproduce la ESTRUCTURA
   * real (recortada a lo esencial: encabezado + 4 filas + totales) tal como
   * la vio Andrés, con nombre de empresa/NIT/códigos de producto
   * reemplazados por datos ficticios (nunca se comitea el texto OCR real de
   * un documento real, `CLAUDE.md` §12) -- incluida la fila con "3,952": el
   * OCR confundió el punto de miles con una coma ahí mismo, mientras el
   * resto de la misma factura sí usa punto ("20.798", "24.750"), así que el
   * parser tiene que aceptar cualquiera de los dos como separador de miles.
   */
  it("factura real (estructura anonimizada): no confunde el número de fila del encabezado de la tabla con IVA/Valor/Total, y tolera que el OCR confunda '.'/',' como separador de miles", () => {
    const ocrResult = makeOCRResult([
      "FERRETERIA EJEMPLO SAS IVA Régimen Común No somos Agentes de Retención de IVA",
      "No somos Grandes Contribuyentes",
      "Nit 900123456",
      "Item | Código | Descripción | Cantidad | U Medida | Valor Unitario | IVA | Valor IVA Total",
      '1 P001 [HERRAMIENTA UNO 1 Und. 8.500 | 19% 1.357 8.500',
      '2 P002 [HERRAMIENTA DOS 1 "Und. 6.000| 19% 958 6.000',
      '3 P003 [HERRAMIENTA TRES 50 Und. 125 19% 20 6250',
      '4 P004 [HERRAMIENTA CUATRO 1 Und. 4.000 | 19% 639 4.000',
      "Valor en Letras VEINTICUATRO MIL SETECIENTOS CINCUENTA PESOS MICTE",
      "Elena SUBTOTAL 20.798 RETEFUENTE [1",
      "E IVA 3,952 RETEICA [1]",
      "Firma Responsable EZ TOTAL DE LA OPERACIÓN 24.750 TOTAL MENOS RETENCIONES 24.750",
    ]);

    const fields = extractFields(ocrResult);

    expect(fields.iva).toMatchObject({ value: 3952, confidence: 0.95 });
    expect(fields.valor).toMatchObject({ value: 20798, confidence: 0.95 });
    expect(fields.total).toMatchObject({ value: 24750, confidence: 0.95 });
    // 20.798 (subtotal) + 3.952 (IVA) = 24.750 (total) -- coherencia real
    // de la propia factura, no solo "algún número parseó bien".
    expect(fields.valor.value! + fields.iva.value!).toBe(fields.total.value);
  });

  it("no confunde un código de producto alfanumérico (p. ej. 'E141') con un monto, aunque esté pegado al keyword", () => {
    const ocrResult = makeOCRResult(["Total E141"]);
    const fields = extractFields(ocrResult);
    // "E141" no es un monto -- ni siquiera debería contarse como candidato
    // (el "141" está pegado a una letra), así que el campo queda sin valor
    // en vez de inventar 141.
    expect(fields.total).toEqual({ value: null, confidence: 0, sourceRegion: null });
  });

  it("no confunde el número de fila de una tabla ('1', '2'...) con un monto, aunque esté justo después del keyword", () => {
    const ocrResult = makeOCRResult(["Valor Total", "1 primer ítem", "2 segundo ítem", "Total real: 45.678"]);
    const fields = extractFields(ocrResult);
    expect(fields.total).toMatchObject({ value: 45678 });
  });

  it("acepta coma como separador de MILES cuando el OCR confunde el glifo con el punto (3 dígitos exactos -- no un decimal real)", () => {
    const ocrResult = makeOCRResult(["IVA 3,952"]);
    const fields = extractFields(ocrResult);
    expect(fields.iva).toMatchObject({ value: 3952, confidence: 0.95 });
  });

  /**
   * Segundo bug real, mismo día (2026-09-15), segunda factura real de otro
   * proveedor de Mansor (Andrés: "ya casi ahora iva y valor lo reconoce,
   * ahora falta es valor total"): el código de producto de la primera fila
   * de la tabla venía como "VISP.001CU" -- el "001" queda pegado a un
   * PUNTO por un lado (no una letra, por eso el primer fix de
   * `field-extraction-helpers.ts` no alcanzaba) y a las letras "CU" por el
   * otro. Reproduce la estructura esencial (NIT + encabezado con "Total" +
   * una fila con ese patrón de código + sección de totales), con nombre de
   * empresa/NIT/código de producto ficticios.
   */
  it("no confunde un código de producto con dígitos pegados a un punto y a letras (p. ej. 'COD.001XY') con un monto, aunque esté en la fila justo debajo del encabezado 'Total'", () => {
    const ocrResult = makeOCRResult([
      "NIT 900111222-3",
      "Item Código Descripción Cantidad U Medida Valor Unitario IVA Total",
      "1 COD.001XY HERRAMIENTA EJEMPLO UNO 1,00 Und 127.731 19% 127.731",
      "2 701 HERRAMIENTA EJEMPLO DOS 1,00 Und 10.504 19% 10.504",
      "SUBTOTAL 156.975",
      "IVA 29.825",
      "TOTAL DE LA OPERACION 186.800",
    ]);

    const fields = extractFields(ocrResult);

    expect(fields.iva).toMatchObject({ value: 29825, confidence: 0.95 });
    expect(fields.valor).toMatchObject({ value: 156975, confidence: 0.95 });
    expect(fields.total).toMatchObject({ value: 186800, confidence: 0.95 });
  });

  /**
   * Heurística "línea arriba del NIT" (ver JSDoc de `findProveedorNearNit`)
   * contra la estructura de la segunda factura real: el nombre de la
   * empresa está justo arriba del NIT, pero el sufijo de razón social
   * salió del OCR como "5.A.S." (el "5" en vez de una "S") -- el patrón de
   * sufijo no lo reconoce, así que la línea NO debe recortarse: mejor
   * conservar el ruido visible que inventar un corte incorrecto.
   */
  it("proveedor: heurística posicional tolera un sufijo de razón social mal reconocido por el OCR ('S.A.S.' -> '5.A.S.') sin recortar la línea", () => {
    const ocrResult = makeOCRResult([
      "» DISTRIBUIDORA EJEMPLO 5.A.S. ACME",
      "Nit. 900.564.101-0",
      "Responsable del IVA No somos Agentes de Retención de IVA",
      "No somos Grandes Contribuyentes Ni Autorretenedores",
    ]);

    const fields = extractFields(ocrResult);

    expect(fields.proveedor).toMatchObject({ value: "» DISTRIBUIDORA EJEMPLO 5.A.S. ACME", confidence: 0.6 });
    expect(fields.nit).toMatchObject({ value: "900.564.101-0", confidence: 0.95 });
  });

  it("sourceRegion apunta a la línea correcta donde aparece el campo", () => {
    const ocrResult = makeOCRResult(["NIT 123456789", "Total 1468.12"]);
    const fields = extractFields(ocrResult);

    expect(fields.nit.sourceRegion).toEqual({ x: 5, y: 0, w: ocrResult.lines[0].text.length * 8, h: 20 });
    expect(fields.total.sourceRegion).toEqual({ x: 5, y: 25, w: ocrResult.lines[1].text.length * 8, h: 20 });
  });
});
