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
  it("caso claro (ejemplo del prompt): todos los campos con confidence 0.95", () => {
    const ocrResult = makeOCRResult([
      "NIT 123456789",
      "Fecha 12/08/2025",
      "IVA 234.56",
      "Valor 1234.56",
      "Total 1468.12",
    ]);

    const fields = extractFields(ocrResult);

    expect(fields.nit).toMatchObject({ value: "123456789", confidence: 0.95 });
    expect(fields.fecha).toMatchObject({ value: "12/08/2025", confidence: 0.95 });
    expect(fields.iva).toMatchObject({ value: 234.56, confidence: 0.95 });
    expect(fields.valor).toMatchObject({ value: 1234.56, confidence: 0.95 });
    expect(fields.total).toMatchObject({ value: 1468.12, confidence: 0.95 });
    expect(fields.extractionMethod).toBe("pattern");
    expect(fields.rawOCR).toBe(ocrResult.rawText);
  });

  it("no confunde 'Total' con la 'total' dentro de 'Subtotal'", () => {
    const ocrResult = makeOCRResult(["Subtotal 500.00", "Total 650.00"]);
    const fields = extractFields(ocrResult);

    expect(fields.valor).toMatchObject({ value: 500.0, confidence: 0.95 });
    expect(fields.total).toMatchObject({ value: 650.0, confidence: 0.95 });
  });

  it("NIT con formato punteado (XXX.XXX.XXX-X)", () => {
    const ocrResult = makeOCRResult(["NIT 900.123.456-7"]);
    const fields = extractFields(ocrResult);
    expect(fields.nit.value).toBe("900.123.456-7");
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
    const ocrResult = makeOCRResult(["IVA incluido en el precio total del documento: 234.56"]);
    const fields = extractFields(ocrResult);
    expect(fields.iva.value).toBe(234.56);
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
