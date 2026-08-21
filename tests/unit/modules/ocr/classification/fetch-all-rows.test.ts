import { describe, expect, it, vi } from "vitest";
import { fetchAllRows } from "@/modules/ocr/classification/fetch-all-rows";

/** Simula una tabla de `total` filas, paginada por `[from, to]` inclusive, igual que `.range()` de Supabase. */
function fakeTable(total: number) {
  const rows = Array.from({ length: total }, (_, i) => ({ id: i }));
  return vi.fn((from: number, to: number) => Promise.resolve({ data: rows.slice(from, to + 1), error: null }));
}

describe("fetchAllRows", () => {
  it("trae todas las filas cuando caben en una sola página", async () => {
    const fetchPage = fakeTable(5);
    const rows = await fetchAllRows(fetchPage, 10);
    expect(rows).toHaveLength(5);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("pagina hasta traer todas las filas cuando el total excede el tamaño de página (el bug real: 3107 filas, páginas de 1000)", async () => {
    const fetchPage = fakeTable(3107);
    const rows = await fetchAllRows(fetchPage, 1000);
    expect(rows).toHaveLength(3107);
    expect(fetchPage).toHaveBeenCalledTimes(4); // 1000+1000+1000+107
    expect(fetchPage).toHaveBeenNthCalledWith(1, 0, 999);
    expect(fetchPage).toHaveBeenNthCalledWith(4, 3000, 3999);
  });

  it("cuando el total es un múltiplo exacto del tamaño de página, pide una página extra vacía para confirmar el fin (no se puede saber que la página llena era la última sin comprobarlo)", async () => {
    const fetchPage = fakeTable(2000);
    const rows = await fetchAllRows(fetchPage, 1000);
    expect(rows).toHaveLength(2000);
    expect(fetchPage).toHaveBeenCalledTimes(3); // 1000 + 1000 + 0 (la que confirma que no queda nada más)
  });

  it("devuelve vacío sin lanzar si la tabla está vacía", async () => {
    const fetchPage = fakeTable(0);
    const rows = await fetchAllRows(fetchPage, 1000);
    expect(rows).toHaveLength(0);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("lanza con el mensaje del error si una página falla, sin seguir pidiendo más", async () => {
    const fetchPage = vi.fn().mockResolvedValueOnce({ data: null, error: { message: "conexión perdida" } });
    await expect(fetchAllRows(fetchPage, 1000)).rejects.toThrow("conexión perdida");
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });
});
