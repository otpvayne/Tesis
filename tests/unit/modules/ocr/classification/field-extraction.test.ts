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
   * real todavía — al hacerlo (Fase de integración de Tesseract.js), se
   * encontró que ese formato le hacía perder dígitos a montos reales
   * (`docs/ocr/evaluation.md` documenta el hallazgo). Se corrigieron aquí
   * para reflejar el formato real del dominio (RF-003, "facturación
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
    const ocrResult = makeOCRResult(["Proveedor: Acme Suministros SAS", "NIT 900123456"]);
    const fields = extractFields(ocrResult);
    expect(fields.proveedor).toMatchObject({ value: "Acme Suministros SAS", confidence: 0.9 });
  });

  it("proveedor: sin keyword, usa la primera línea con letras como conjetura (confidence baja)", () => {
    const ocrResult = makeOCRResult(["Acme Suministros SAS", "NIT 900123456"]);
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
    const ocrResult = makeOCRResult(["algo 55.00 y despues 99.00, sin ninguna palabra clave"]);
    const fields = extractFields(ocrResult);
    // ninguna keyword de iva/valor/total aparece -> los 3 campos caen al
    // mismo primer candidato (55.00), confidence 0.5 -- limitación
    // documentada: sin keywords, no hay forma de distinguir los campos.
    expect(fields.iva).toMatchObject({ value: 55.0, confidence: 0.5 });
    expect(fields.valor).toMatchObject({ value: 55.0, confidence: 0.5 });
    expect(fields.total).toMatchObject({ value: 55.0, confidence: 0.5 });
  });

  it("sourceRegion apunta a la línea correcta donde aparece el campo", () => {
    const ocrResult = makeOCRResult(["NIT 123456789", "Total 1468.12"]);
    const fields = extractFields(ocrResult);

    expect(fields.nit.sourceRegion).toEqual({ x: 5, y: 0, w: ocrResult.lines[0].text.length * 8, h: 20 });
    expect(fields.total.sourceRegion).toEqual({ x: 5, y: 25, w: ocrResult.lines[1].text.length * 8, h: 20 });
  });
});
