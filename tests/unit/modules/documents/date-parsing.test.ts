import { describe, expect, it } from "vitest";
import { parseInvoiceDate } from "@/modules/documents/date-parsing";

describe("parseInvoiceDate", () => {
  it("acepta formato ISO (AAAA-MM-DD) válido", () => {
    expect(parseInvoiceDate("2025-08-12")).toBe("2025-08-12");
  });

  it("acepta formato colombiano día/mes/año, normalizando a ISO", () => {
    expect(parseInvoiceDate("12/08/2025")).toBe("2025-08-12");
  });

  it("interpreta día-mes, NO mes-día (formato colombiano, no estadounidense)", () => {
    // "05/03/2025" es 5 de marzo, no 3 de mayo -- si se interpretara al
    // revés, este assert fallaría con "2025-05-03".
    expect(parseInvoiceDate("05/03/2025")).toBe("2025-03-05");
  });

  it("acepta día/mes de un solo dígito", () => {
    expect(parseInvoiceDate("5/3/2025")).toBe("2025-03-05");
  });

  it("acepta el separador '-' además de '/'", () => {
    expect(parseInvoiceDate("12-08-2025")).toBe("2025-08-12");
  });

  it("rechaza un mes fuera de rango (13)", () => {
    expect(parseInvoiceDate("12/13/2025")).toBeNull();
  });

  it("rechaza un día que no existe en el mes (31 de febrero)", () => {
    expect(parseInvoiceDate("31/02/2025")).toBeNull();
  });

  it("acepta el 29 de febrero en año bisiesto", () => {
    expect(parseInvoiceDate("29/02/2024")).toBe("2024-02-29");
  });

  it("rechaza el 29 de febrero en año NO bisiesto", () => {
    expect(parseInvoiceDate("29/02/2025")).toBeNull();
  });

  it("rechaza texto que no matchea ningún formato", () => {
    expect(parseInvoiceDate("agosto 12 de 2025")).toBeNull();
  });

  it("rechaza cadena vacía, null y undefined sin lanzar", () => {
    expect(parseInvoiceDate("")).toBeNull();
    expect(parseInvoiceDate(null)).toBeNull();
    expect(parseInvoiceDate(undefined)).toBeNull();
  });
});
