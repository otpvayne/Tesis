import { describe, expect, it } from "vitest";
import { buildValidationPayload, computeConfidenceLevel, parseFieldValue } from "@/modules/documents/validation-logic";
import type { ValidationFieldInput } from "@/modules/documents/validation-types";

describe("computeConfidenceLevel", () => {
  it("clasifica >90% como high (verde)", () => {
    expect(computeConfidenceLevel(0.95)).toBe("high");
    expect(computeConfidenceLevel(0.901)).toBe("high");
  });

  it("clasifica exactamente 90% y 75-90% como medium (amarillo)", () => {
    expect(computeConfidenceLevel(0.9)).toBe("medium");
    expect(computeConfidenceLevel(0.85)).toBe("medium");
    expect(computeConfidenceLevel(0.75)).toBe("medium");
  });

  it("clasifica <75% como low (rojo)", () => {
    expect(computeConfidenceLevel(0.74)).toBe("low");
    expect(computeConfidenceLevel(0)).toBe("low");
  });
});

describe("parseFieldValue", () => {
  it("parsea un campo numérico válido", () => {
    expect(parseFieldValue("iva", "234.56")).toEqual({ ok: true, value: 234.56 });
    expect(parseFieldValue("total", "1500")).toEqual({ ok: true, value: 1500 });
  });

  it("rechaza un campo numérico inválido", () => {
    const result = parseFieldValue("valor", "no-es-numero");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("no-es-numero");
  });

  it("un campo numérico vacío se guarda como null (no como error)", () => {
    expect(parseFieldValue("iva", "   ")).toEqual({ ok: true, value: null });
  });

  it("recorta espacios en un campo de texto", () => {
    expect(parseFieldValue("proveedor", "  Empresa XYZ  ")).toEqual({ ok: true, value: "Empresa XYZ" });
  });

  it("un campo de texto vacío se guarda como null", () => {
    expect(parseFieldValue("nit", "")).toEqual({ ok: true, value: null });
  });
});

describe("buildValidationPayload", () => {
  it("sin ninguna corrección: validatedData == originalExtractedData, manuallyEdited=false", () => {
    const fields: ValidationFieldInput[] = [
      { field: "proveedor", extractedValue: "Empresa XYZ", confidence: 0.92 },
      { field: "nit", extractedValue: "123456789", confidence: 0.95 },
      { field: "fecha", extractedValue: "12/08/2025", confidence: 0.85 },
      { field: "iva", extractedValue: 234.56, confidence: 0.81 },
      { field: "valor", extractedValue: 1234.56, confidence: 0.8 },
      { field: "total", extractedValue: 1468.12, confidence: 0.83 },
    ];

    const result = buildValidationPayload(fields);

    expect(result.originalExtractedData).toEqual(result.validatedData);
    expect(result.manuallyEdited).toBe(false);
    expect(result.editedFields).toEqual([]);
  });

  it("con dos campos corregidos: solo esos dos aparecen en editedFields, el resto queda igual", () => {
    const fields: ValidationFieldInput[] = [
      { field: "proveedor", extractedValue: "Empresa XYZ", confidence: 0.92 },
      { field: "nit", extractedValue: "123456789", confidence: 0.95 },
      { field: "fecha", extractedValue: "12/08/2025", confidence: 0.85 },
      { field: "iva", extractedValue: 234.56, confidence: 0.81 },
      { field: "valor", extractedValue: 1234.56, confidence: 0.8, correctedValue: 1250.0 },
      { field: "total", extractedValue: 1468.12, confidence: 0.83, correctedValue: 1484.5 },
    ];

    const result = buildValidationPayload(fields);

    expect(result.validatedData).toEqual({
      proveedor: "Empresa XYZ",
      nit: "123456789",
      fecha: "12/08/2025",
      iva: 234.56,
      valor: 1250.0,
      total: 1484.5,
    });
    expect(result.originalExtractedData.valor).toBe(1234.56);
    expect(result.manuallyEdited).toBe(true);
    expect(result.editedFields).toEqual(["valor", "total"]);
  });

  it("correctedValue igual a extractedValue no cuenta como editado (defensivo, aunque el caller ya no debería mandarlo)", () => {
    const fields: ValidationFieldInput[] = [
      { field: "nit", extractedValue: "123456789", confidence: 0.95, correctedValue: "123456789" },
    ];

    const result = buildValidationPayload(fields);

    expect(result.manuallyEdited).toBe(false);
    expect(result.editedFields).toEqual([]);
  });

  it("corregir un campo a null cuenta como edición", () => {
    const fields: ValidationFieldInput[] = [{ field: "fecha", extractedValue: "12/08/2025", confidence: 0.6, correctedValue: null }];

    const result = buildValidationPayload(fields);

    expect(result.validatedData.fecha).toBeNull();
    expect(result.manuallyEdited).toBe(true);
    expect(result.editedFields).toEqual(["fecha"]);
  });

  it("lista vacía no lanza y devuelve objetos vacíos", () => {
    const result = buildValidationPayload([]);
    expect(result.originalExtractedData).toEqual({});
    expect(result.validatedData).toEqual({});
    expect(result.manuallyEdited).toBe(false);
    expect(result.editedFields).toEqual([]);
  });
});
