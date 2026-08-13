import { describe, expect, it } from "vitest";
import { buildDocumentsReportRows, buildValidationsReportRows, DOCUMENTS_REPORT_HEADERS, VALIDATIONS_REPORT_HEADERS } from "@/modules/admin/reports";
import { toCsv } from "@/modules/admin/csv";

describe("buildDocumentsReportRows", () => {
  it("arma una fila por documento con el ocr_results/document_validations más reciente", () => {
    const rows = buildDocumentsReportRows([
      {
        id: "doc-1",
        document_type: "invoice_es",
        status: "validated",
        created_at: "2026-08-01T00:00:00Z",
        ocr_results: [
          { confidence: 0.5, created_at: "2026-08-01T01:00:00Z" },
          { confidence: 0.87, created_at: "2026-08-01T02:00:00Z" },
        ],
        document_validations: [{ validated_at: "2026-08-01T03:00:00Z", validator: { email: "diego@example.com" } }],
      },
    ]);

    expect(rows).toEqual([["doc-1", "invoice_es", "Validado", "87.0%", "2026-08-01T03:00:00Z", "diego@example.com", "2026-08-01T00:00:00Z"]]);
  });

  it("un documento sin ocr_results ni document_validations deja esas columnas vacías, sin lanzar", () => {
    const rows = buildDocumentsReportRows([
      {
        id: "doc-2",
        document_type: "invoice_es",
        status: "uploaded",
        created_at: "2026-08-01T00:00:00Z",
        ocr_results: [],
        document_validations: [],
      },
    ]);

    expect(rows).toEqual([["doc-2", "invoice_es", "Cargado", "", "", "", "2026-08-01T00:00:00Z"]]);
  });

  it("confidence 0 (válido, no ausente) se formatea como 0.0%, no como vacío", () => {
    const rows = buildDocumentsReportRows([
      {
        id: "doc-3",
        document_type: "invoice_es",
        status: "processed",
        created_at: "2026-08-01T00:00:00Z",
        ocr_results: [{ confidence: 0, created_at: "2026-08-01T01:00:00Z" }],
        document_validations: [],
      },
    ]);

    expect(rows[0][3]).toBe("0.0%");
  });

  it("lista vacía no lanza", () => {
    expect(buildDocumentsReportRows([])).toEqual([]);
  });

  it("el CSV final resultante escapa correctamente un email con coma (caso límite real)", () => {
    const rows = buildDocumentsReportRows([
      {
        id: "doc-4",
        document_type: "invoice_es",
        status: "validated",
        created_at: "2026-08-01T00:00:00Z",
        ocr_results: [],
        document_validations: [{ validated_at: "2026-08-01T03:00:00Z", validator: { email: "a,b@example.com" } }],
      },
    ]);
    const csv = toCsv(DOCUMENTS_REPORT_HEADERS, rows);
    expect(csv).toContain('"a,b@example.com"');
  });
});

describe("buildValidationsReportRows", () => {
  it("arma 6 filas (una por campo de RF-003) por cada validación", () => {
    const rows = buildValidationsReportRows([
      {
        document_id: "doc-1",
        original_extracted_data: { nit: "111", iva: 10 },
        validated_data: { nit: "222", iva: 10 },
        validated_at: "2026-08-01T00:00:00Z",
        validator: { email: "diego@example.com" },
      },
    ]);

    expect(rows).toHaveLength(6);
    const nitRow = rows.find((r) => r[1] === "NIT");
    expect(nitRow).toEqual(["doc-1", "NIT", "111", "222", "diego@example.com", "2026-08-01T00:00:00Z"]);
    const ivaRow = rows.find((r) => r[1] === "IVA");
    expect(ivaRow).toEqual(["doc-1", "IVA", "10", "10", "diego@example.com", "2026-08-01T00:00:00Z"]);
  });

  it("un campo ausente en ambos lados se escribe como cadena vacía, no 'null'", () => {
    const rows = buildValidationsReportRows([
      {
        document_id: "doc-2",
        original_extracted_data: {},
        validated_data: {},
        validated_at: "2026-08-01T00:00:00Z",
        validator: null,
      },
    ]);

    expect(rows.every((r) => r[2] === "" && r[3] === "" && r[4] === "")).toBe(true);
  });

  it("múltiples validaciones se concatenan (flatMap), no se anidan", () => {
    const rows = buildValidationsReportRows([
      { document_id: "doc-1", original_extracted_data: {}, validated_data: {}, validated_at: "t1", validator: null },
      { document_id: "doc-2", original_extracted_data: {}, validated_data: {}, validated_at: "t2", validator: null },
    ]);
    expect(rows).toHaveLength(12);
  });

  it("lista vacía no lanza", () => {
    expect(buildValidationsReportRows([])).toEqual([]);
  });

  it("VALIDATIONS_REPORT_HEADERS tiene 6 columnas fijas", () => {
    expect(VALIDATIONS_REPORT_HEADERS).toHaveLength(6);
  });
});
