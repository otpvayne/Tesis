import { describe, expect, it } from "vitest";
import {
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_TYPE_LABELS,
  getDocumentStatusLabel,
  getDocumentTypeLabel,
} from "@/lib/constants/document-display";
import { DOCUMENT_STATUSES, DOCUMENT_TYPES } from "@/modules/documents/types";

describe("getDocumentTypeLabel", () => {
  it("traduce invoice_es a Factura", () => {
    expect(getDocumentTypeLabel("invoice_es")).toBe("Factura");
  });

  it("tiene una etiqueta para cada DocumentType declarado", () => {
    for (const type of DOCUMENT_TYPES) {
      expect(DOCUMENT_TYPE_LABELS[type]).toBeTruthy();
    }
  });

  it("devuelve el valor original si no hay traducción conocida", () => {
    expect(getDocumentTypeLabel("future_document_type_2")).toBe("future_document_type_2");
  });
});

describe("getDocumentStatusLabel", () => {
  it.each([
    ["uploaded", "Cargado"],
    ["processing", "Procesando"],
    ["processed", "Procesado"],
    ["validated", "Validado"],
    ["failed", "Error"],
  ])("traduce %s a %s", (status, label) => {
    expect(getDocumentStatusLabel(status)).toBe(label);
  });

  it("tiene una etiqueta para cada DocumentStatus declarado", () => {
    for (const status of DOCUMENT_STATUSES) {
      expect(DOCUMENT_STATUS_LABELS[status]).toBeTruthy();
    }
  });

  it("devuelve el valor original si no hay traducción conocida", () => {
    expect(getDocumentStatusLabel("unknown_status")).toBe("unknown_status");
  });
});
