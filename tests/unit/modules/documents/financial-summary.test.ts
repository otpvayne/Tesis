import { describe, expect, it } from "vitest";
import { buildFinancialSummary, type FinancialSummaryRow } from "@/modules/documents/financial-summary";

function invoiceRow(id: string, overrides: { fecha?: string; nit?: string; proveedor?: string; total?: number }): FinancialSummaryRow {
  return {
    documentId: id,
    documentType: "invoice_es",
    validatedData: {
      fecha: overrides.fecha ?? "2025-08-12",
      nit: overrides.nit ?? "900123456",
      proveedor: overrides.proveedor ?? "Acme Suministros SAS",
      total: overrides.total ?? 100000,
    },
  };
}

function contractRow(id: string, overrides: { fecha?: string; identificacion?: string; proveedor?: string; valorTotal?: number }): FinancialSummaryRow {
  return {
    documentId: id,
    documentType: "contract_es",
    validatedData: {
      fecha: overrides.fecha ?? "2025-08-12",
      identificacion: overrides.identificacion ?? "900123456",
      proveedor: overrides.proveedor ?? "Acme Suministros SAS",
      valorTotal: overrides.valorTotal ?? 500000,
    },
  };
}

describe("buildFinancialSummary", () => {
  it("suma el total correcto por documento, usando el campo de monto según el tipo (total para facturas, valorTotal para contratos)", () => {
    const summary = buildFinancialSummary([invoiceRow("1", { total: 100000 }), contractRow("2", { valorTotal: 500000 })]);

    expect(summary.totalAmount).toBe(600000);
    expect(summary.documentsIncluded).toBe(2);
  });

  it("agrupa por día usando la fecha de la factura, no un orden arbitrario", () => {
    const summary = buildFinancialSummary([
      invoiceRow("1", { fecha: "2025-08-12", total: 100000 }),
      invoiceRow("2", { fecha: "2025-08-12", total: 50000 }),
      invoiceRow("3", { fecha: "2025-08-10", total: 20000 }),
    ]);

    expect(summary.byDay).toEqual([
      { date: "2025-08-10", total: 20000, count: 1 },
      { date: "2025-08-12", total: 150000, count: 2 },
    ]);
  });

  it("agrupa por NIT/identificación, ordenado de mayor a menor gasto", () => {
    const summary = buildFinancialSummary([
      invoiceRow("1", { nit: "900111111", proveedor: "Proveedor A", total: 30000 }),
      invoiceRow("2", { nit: "900222222", proveedor: "Proveedor B", total: 90000 }),
      invoiceRow("3", { nit: "900111111", proveedor: "Proveedor A", total: 30000 }),
    ]);

    expect(summary.byIdentifier).toEqual([
      { identifier: "900222222", proveedor: "Proveedor B", total: 90000, count: 1 },
      { identifier: "900111111", proveedor: "Proveedor A", total: 60000, count: 2 },
    ]);
  });

  it("filtra por rango de fechas (inclusive en ambos extremos)", () => {
    const rows = [
      invoiceRow("1", { fecha: "2025-08-01", total: 10 }),
      invoiceRow("2", { fecha: "2025-08-10", total: 20 }),
      invoiceRow("3", { fecha: "2025-08-20", total: 40 }),
    ];

    const summary = buildFinancialSummary(rows, { from: "2025-08-05", to: "2025-08-15" });

    expect(summary.documentsIncluded).toBe(1);
    expect(summary.totalAmount).toBe(20);
  });

  it("incluye los límites exactos del rango", () => {
    const rows = [invoiceRow("1", { fecha: "2025-08-05", total: 10 }), invoiceRow("2", { fecha: "2025-08-15", total: 20 })];
    const summary = buildFinancialSummary(rows, { from: "2025-08-05", to: "2025-08-15" });
    expect(summary.documentsIncluded).toBe(2);
    expect(summary.totalAmount).toBe(30);
  });

  it("excluye del total un documento con fecha no interpretable, y lo cuenta aparte (no desaparece silenciosamente)", () => {
    const summary = buildFinancialSummary([invoiceRow("1", { fecha: "fecha ilegible", total: 999999 }), invoiceRow("2", { fecha: "2025-08-12", total: 100 })]);

    expect(summary.documentsWithUnparseableDate).toBe(1);
    expect(summary.documentsIncluded).toBe(1);
    expect(summary.totalAmount).toBe(100);
  });

  it("usa '(sin identificar)' cuando el NIT/identificación no está presente en el dato validado", () => {
    const row: FinancialSummaryRow = {
      documentId: "1",
      documentType: "invoice_es",
      validatedData: { fecha: "2025-08-12", total: 100 },
    };
    const summary = buildFinancialSummary([row]);
    expect(summary.byIdentifier).toEqual([{ identifier: "(sin identificar)", proveedor: null, total: 100, count: 1 }]);
  });

  it("trata un monto ausente o no numérico como 0, sin lanzar", () => {
    const row: FinancialSummaryRow = {
      documentId: "1",
      documentType: "invoice_es",
      validatedData: { fecha: "2025-08-12", nit: "900123456", total: "no es un número" },
    };
    const summary = buildFinancialSummary([row]);
    expect(summary.totalAmount).toBe(0);
    expect(summary.documentsIncluded).toBe(1);
  });

  it("sin documentos -> resumen vacío en 0, no lanza", () => {
    const summary = buildFinancialSummary([]);
    expect(summary).toEqual({
      totalAmount: 0,
      documentsIncluded: 0,
      documentsWithUnparseableDate: 0,
      byDay: [],
      byIdentifier: [],
      documents: [],
    });
  });

  it("arma el detalle documento por documento, más reciente primero, con el documentId para poder linkear a la factura/contrato original", () => {
    const summary = buildFinancialSummary([
      invoiceRow("1", { fecha: "2025-08-01", nit: "900111111", proveedor: "Proveedor A", total: 10 }),
      contractRow("2", { fecha: "2025-08-20", identificacion: "900222222", proveedor: "Proveedor B", valorTotal: 40 }),
    ]);

    expect(summary.documents).toEqual([
      { documentId: "2", documentType: "contract_es", date: "2025-08-20", identifier: "900222222", proveedor: "Proveedor B", amount: 40 },
      { documentId: "1", documentType: "invoice_es", date: "2025-08-01", identifier: "900111111", proveedor: "Proveedor A", amount: 10 },
    ]);
  });

  it("filtra por NIT/identificación, independiente del rango de fechas -- pedido explícito: solo NIT, sin fechas, debe funcionar igual", () => {
    const rows = [
      invoiceRow("1", { nit: "900111111", proveedor: "Proveedor A", total: 30000 }),
      invoiceRow("2", { nit: "900222222", proveedor: "Proveedor B", total: 90000 }),
    ];

    const summary = buildFinancialSummary(rows, { identifier: "900111111" });

    expect(summary.documentsIncluded).toBe(1);
    expect(summary.totalAmount).toBe(30000);
    expect(summary.documents).toEqual([{ documentId: "1", documentType: "invoice_es", date: "2025-08-12", identifier: "900111111", proveedor: "Proveedor A", amount: 30000 }]);
  });

  it("combina NIT + rango de fechas cuando ambos están presentes", () => {
    const rows = [
      invoiceRow("1", { fecha: "2025-08-01", nit: "900111111", total: 10 }),
      invoiceRow("2", { fecha: "2025-08-20", nit: "900111111", total: 40 }),
      invoiceRow("3", { fecha: "2025-08-20", nit: "900222222", total: 999 }),
    ];

    const summary = buildFinancialSummary(rows, { from: "2025-08-10", to: "2025-08-31", identifier: "900111111" });

    expect(summary.documentsIncluded).toBe(1);
    expect(summary.totalAmount).toBe(40);
  });

  it("el filtro de NIT ignora puntos, guiones, espacios y mayúsculas -- no exige el formato exacto guardado", () => {
    const rows = [invoiceRow("1", { nit: "900.123.456-7", total: 100 })];

    const summary = buildFinancialSummary(rows, { identifier: " 9001234567 " });

    expect(summary.documentsIncluded).toBe(1);
    expect(summary.totalAmount).toBe(100);
  });

  it("con filtro de NIT activo, una fecha no interpretable de OTRO NIT no se cuenta como aviso (no es relevante para esta consulta)", () => {
    const rows = [invoiceRow("1", { nit: "900222222", fecha: "fecha ilegible", total: 999 }), invoiceRow("2", { nit: "900111111", total: 100 })];

    const summary = buildFinancialSummary(rows, { identifier: "900111111" });

    expect(summary.documentsWithUnparseableDate).toBe(0);
    expect(summary.documentsIncluded).toBe(1);
  });

  it("un NIT que no coincide con ningún documento da un resumen vacío en 0, no lanza", () => {
    const summary = buildFinancialSummary([invoiceRow("1", { nit: "900111111", total: 100 })], { identifier: "000000000" });

    expect(summary.documentsIncluded).toBe(0);
    expect(summary.totalAmount).toBe(0);
    expect(summary.documents).toEqual([]);
  });
});
