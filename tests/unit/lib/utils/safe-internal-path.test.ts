import { describe, expect, it } from "vitest";
import { safeInternalPath } from "@/lib/utils/safe-internal-path";

describe("safeInternalPath", () => {
  it("acepta una ruta relativa interna válida", () => {
    expect(safeInternalPath("/documents?status=processed", "/documents")).toBe(
      "/documents?status=processed",
    );
  });

  it("devuelve el fallback cuando el valor es null, undefined o vacío", () => {
    expect(safeInternalPath(null, "/documents")).toBe("/documents");
    expect(safeInternalPath(undefined, "/documents")).toBe("/documents");
    expect(safeInternalPath("", "/documents")).toBe("/documents");
  });

  it("rechaza una URL absoluta externa (no empieza con /)", () => {
    expect(safeInternalPath("https://evil.com", "/documents")).toBe("/documents");
  });

  it("rechaza una URL protocol-relative (//host, evade el chequeo de esquema)", () => {
    expect(safeInternalPath("//evil.com", "/documents")).toBe("/documents");
  });

  it("rechaza un esquema no-http (javascript:, etc.)", () => {
    expect(safeInternalPath("javascript:alert(1)", "/documents")).toBe("/documents");
  });
});
