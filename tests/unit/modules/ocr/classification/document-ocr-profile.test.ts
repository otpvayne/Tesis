import { describe, expect, it } from "vitest";
import { extractFieldsForDocumentType, ocrEngineForDocumentType } from "@/modules/ocr/classification/document-ocr-profile";
import type { OCRResult } from "@/modules/ocr/pipeline/ocr-pipeline";

function makeOCRResult(lines: string[]): OCRResult {
  const ocrLines = lines.map((text, i) => ({ text, bbox: { x: 5, y: i * 25, width: text.length * 8, height: 20 }, confidence: 0.9 }));
  return {
    rawText: ocrLines.map((l) => l.text).join("\n"),
    confidence: 0.9,
    lines: ocrLines,
    processedAt: new Date(),
    timingMs: { preprocess: 0, segmentation: 0, recognition: 0, total: 0 },
  };
}

describe("extractFieldsForDocumentType", () => {
  it("invoice_es usa extractFields (campos de factura)", () => {
    const fields = extractFieldsForDocumentType("invoice_es", makeOCRResult(["NIT 900123456"]));
    expect(fields).toHaveProperty("nit");
    expect(fields).not.toHaveProperty("vigencia");
  });

  it("contract_es usa extractContractFields (campos de contrato)", () => {
    const fields = extractFieldsForDocumentType("contract_es", makeOCRResult(["Vigencia: 12 meses"]));
    expect(fields).toHaveProperty("vigencia");
    expect(fields).not.toHaveProperty("nit");
  });
});

describe("ocrEngineForDocumentType", () => {
  it("contract_es siempre usa tesseract, sin importar el motor configurado", () => {
    expect(ocrEngineForDocumentType("contract_es", "custom")).toBe("tesseract");
    expect(ocrEngineForDocumentType("contract_es", "tesseract")).toBe("tesseract");
  });

  it("invoice_es respeta el motor configurado", () => {
    expect(ocrEngineForDocumentType("invoice_es", "custom")).toBe("custom");
    expect(ocrEngineForDocumentType("invoice_es", "tesseract")).toBe("tesseract");
  });
});
