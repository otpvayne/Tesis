import { describe, expect, it } from "vitest";
import { toCsv } from "@/modules/admin/csv";

describe("toCsv", () => {
  it("escribe encabezados y filas simples separadas por coma", () => {
    const csv = toCsv(
      ["ID", "Tipo"],
      [
        ["1", "Factura"],
        ["2", "Factura"],
      ],
    );
    expect(csv).toBe("ID,Tipo\r\n1,Factura\r\n2,Factura");
  });

  it("entrecomilla campos que contienen coma", () => {
    const csv = toCsv(["Nombre"], [["Empresa, S.A."]]);
    expect(csv).toBe('Nombre\r\n"Empresa, S.A."');
  });

  it("duplica comillas internas y entrecomilla el campo completo", () => {
    const csv = toCsv(["Nota"], [['dice "hola"']]);
    expect(csv).toBe('Nota\r\n"dice ""hola"""');
  });

  it("entrecomilla campos con salto de línea", () => {
    const csv = toCsv(["Texto"], [["línea1\nlínea2"]]);
    expect(csv).toBe('Texto\r\n"línea1\nlínea2"');
  });

  it("null/undefined se escriben como campo vacío", () => {
    const csv = toCsv(["A", "B"], [[null, undefined]]);
    expect(csv).toBe("A,B\r\n,");
  });

  it("sin filas, devuelve solo el encabezado", () => {
    expect(toCsv(["A", "B"], [])).toBe("A,B");
  });

  it("números y booleanos se convierten a texto", () => {
    expect(toCsv(["N", "B"], [[42, true]])).toBe("N,B\r\n42,true");
  });
});
