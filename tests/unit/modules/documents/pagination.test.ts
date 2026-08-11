import { describe, expect, it } from "vitest";
import { normalizePagination } from "@/modules/documents/pagination";

describe("normalizePagination", () => {
  it("usa los valores por defecto cuando no se pasa nada", () => {
    expect(normalizePagination({})).toEqual({ page: 1, pageSize: 20 });
  });

  it("no permite page menor a 1", () => {
    expect(normalizePagination({ page: 0 })).toEqual({ page: 1, pageSize: 20 });
    expect(normalizePagination({ page: -5 })).toEqual({ page: 1, pageSize: 20 });
  });

  it("trunca page/pageSize no enteros", () => {
    expect(normalizePagination({ page: 2.9, pageSize: 10.9 })).toEqual({
      page: 2,
      pageSize: 10,
    });
  });

  it("limita pageSize a un maximo de 100", () => {
    expect(normalizePagination({ pageSize: 500 })).toEqual({ page: 1, pageSize: 100 });
  });

  it("no permite pageSize menor a 1", () => {
    expect(normalizePagination({ pageSize: 0 })).toEqual({ page: 1, pageSize: 1 });
  });
});
