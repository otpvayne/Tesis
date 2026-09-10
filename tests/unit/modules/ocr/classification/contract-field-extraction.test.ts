import { describe, expect, it } from "vitest";
import { extractContractFields } from "@/modules/ocr/classification/contract-field-extraction";
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

describe("extractContractFields", () => {
  it("caso claro: todos los campos con keyword pegada al valor", () => {
    const ocrResult = makeOCRResult([
      "Proveedor: Acme Suministros SAS",
      "NIT 900123456",
      "Fecha 12/08/2025",
      "Valor total 1.468.000",
      "Vigencia: 12 meses",
      "Tipo de contrato: Prestación de servicios",
      "Número de contrato: CT-2025-014",
    ]);

    const fields = extractContractFields(ocrResult);

    expect(fields.proveedor).toMatchObject({ value: "Acme Suministros SAS", confidence: 0.9 });
    expect(fields.identificacion).toMatchObject({ value: "900123456", confidence: 0.95 });
    expect(fields.fecha).toMatchObject({ value: "12/08/2025", confidence: 0.95 });
    // Formato colombiano real (punto = separador de miles, no decimal) -- ver
    // el fix de MONEY_PATTERN/parseColombianMoney en field-extraction-helpers.ts.
    expect(fields.valorTotal).toMatchObject({ value: 1468000, confidence: 0.95 });
    expect(fields.vigencia).toMatchObject({ value: "12 meses", confidence: 0.9 });
    expect(fields.tipoContrato).toMatchObject({ value: "Prestación de servicios", confidence: 0.9 });
    expect(fields.numeroContrato).toMatchObject({ value: "CT-2025-014", confidence: 0.95 });
    expect(fields.extractionMethod).toBe("pattern");
    expect(fields.rawOCR).toBe(ocrResult.rawText);
  });

  it("identificación: acepta cédula (solo dígitos) además de NIT con guión", () => {
    const ocrResult = makeOCRResult(["Cédula 1020304050"]);
    const fields = extractContractFields(ocrResult);
    expect(fields.identificacion.value).toBe("1020304050");
  });

  it("identificación: formato NIT punteado (XXX.XXX.XXX-X)", () => {
    const ocrResult = makeOCRResult(["NIT 900.123.456-7"]);
    const fields = extractContractFields(ocrResult);
    expect(fields.identificacion.value).toBe("900.123.456-7");
  });

  it("proveedor: sin keyword, usa la primera línea con letras como conjetura (confidence baja)", () => {
    const ocrResult = makeOCRResult(["Acme Suministros SAS", "NIT 900123456"]);
    const fields = extractContractFields(ocrResult);
    expect(fields.proveedor).toMatchObject({ value: "Acme Suministros SAS", confidence: 0.5 });
  });

  it("campo ambiguo: la keyword existe pero no está pegada al número -> confidence 0.7", () => {
    const ocrResult = makeOCRResult(["Valor total del contrato, sujeto a IVA: 1.468.000"]);
    const fields = extractContractFields(ocrResult);
    expect(fields.valorTotal.value).toBe(1468000);
    expect(fields.valorTotal.confidence).toBe(0.7);
  });

  it("campo ausente: sin keyword ni patrón en el texto -> value null, confidence 0", () => {
    const ocrResult = makeOCRResult(["Documento sin datos reconocibles"]);
    const fields = extractContractFields(ocrResult);

    expect(fields.vigencia).toEqual({ value: null, confidence: 0, sourceRegion: null });
    expect(fields.tipoContrato).toEqual({ value: null, confidence: 0, sourceRegion: null });
    expect(fields.numeroContrato).toEqual({ value: null, confidence: 0, sourceRegion: null });
  });

  it("vigencia: sin keyword no inventa un valor (no tiene patrón de respaldo)", () => {
    const ocrResult = makeOCRResult(["12 meses contados desde la firma"]);
    const fields = extractContractFields(ocrResult);
    expect(fields.vigencia).toEqual({ value: null, confidence: 0, sourceRegion: null });
  });

  it("número de contrato: keyword 'Contrato N°' (termina en símbolo, no en letra) sí reconoce el valor pegado", () => {
    // Regresión: "N°" termina en un carácter que no es de palabra ("°"), así que un
    // límite de palabra (\b) fijo al final del keyword nunca matcheaba cuando el
    // símbolo estaba seguido de un espacio -- el caso real más común. Sin el fix de
    // `buildKeywordRegex`, este caso caía al nivel de confianza 0.5 (conjetura, sin
    // keyword detectada) en vez de 0.95 (adyacente a la keyword).
    const ocrResult = makeOCRResult(["Contrato N° 2026-045"]);
    const fields = extractContractFields(ocrResult);
    expect(fields.numeroContrato).toMatchObject({ value: "2026-045", confidence: 0.95 });
  });
});
