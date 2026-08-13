import { describe, expect, it } from "vitest";
import {
  OCR_ALPHABET,
  LABELING_TARGET_PER_CLASS,
  computeClassProgress,
  countPendingByLabel,
  findNextPendingIndex,
} from "@/modules/ocr/training/label-progress";

describe("OCR_ALPHABET", () => {
  it("tiene las 62 clases del alfabeto inicial (0-9, A-Z, a-z) en ese orden", () => {
    expect(OCR_ALPHABET).toHaveLength(62);
    expect(OCR_ALPHABET.slice(0, 10)).toEqual(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]);
    expect(OCR_ALPHABET[10]).toBe("A");
    expect(OCR_ALPHABET[35]).toBe("Z");
    expect(OCR_ALPHABET[36]).toBe("a");
    expect(OCR_ALPHABET[61]).toBe("z");
  });
});

describe("computeClassProgress", () => {
  it("suma savedCount + pendingCount por label, met=false por debajo del target", () => {
    const [entry] = computeClassProgress(["A"], { A: 60 }, { A: 30 });
    expect(entry).toEqual({ label: "A", savedCount: 60, pendingCount: 30, total: 90, met: false });
  });

  it("met=true justo al alcanzar el target, no antes", () => {
    const target = 10;
    const [justBelow] = computeClassProgress(["A"], { A: 9 }, {}, target);
    const [exact] = computeClassProgress(["A"], { A: 10 }, {}, target);
    expect(justBelow.met).toBe(false);
    expect(exact.met).toBe(true);
  });

  it("una clase sin ninguna muestra (guardada ni pendiente) da total=0, met=false", () => {
    const [entry] = computeClassProgress(["Z"], {}, {});
    expect(entry).toEqual({ label: "Z", savedCount: 0, pendingCount: 0, total: 0, met: false });
  });

  it("usa LABELING_TARGET_PER_CLASS (100) como default cuando no se pasa target", () => {
    const [belowDefault] = computeClassProgress(["A"], { A: 99 }, {});
    const [atDefault] = computeClassProgress(["A"], { A: LABELING_TARGET_PER_CLASS }, {});
    expect(belowDefault.met).toBe(false);
    expect(atDefault.met).toBe(true);
  });
});

describe("countPendingByLabel", () => {
  it("cuenta por label, ignorando descartados y sin etiquetar", () => {
    const counts = countPendingByLabel([
      { label: "A", discarded: false },
      { label: "A", discarded: false },
      { label: "B", discarded: false },
      { label: "", discarded: false }, // sin etiquetar todavía
      { label: "A", discarded: true }, // descartado, no cuenta aunque tenga label residual
    ]);
    expect(counts).toEqual({ A: 2, B: 1 });
  });

  it("lista vacía da un objeto vacío", () => {
    expect(countPendingByLabel([])).toEqual({});
  });
});

describe("findNextPendingIndex", () => {
  const pending = (label: string) => ({ label, discarded: false });
  const discarded = () => ({ label: "", discarded: true });

  it("encuentra el siguiente índice sin etiquetar después de fromIndex", () => {
    const items = [pending("1"), { label: "", discarded: false }, { label: "", discarded: false }];
    expect(findNextPendingIndex(items, 0)).toBe(1);
  });

  it("da vuelta al final (wrap-around) si el pendiente quedó antes de fromIndex", () => {
    const items = [{ label: "", discarded: false }, pending("1"), pending("2")];
    expect(findNextPendingIndex(items, 2)).toBe(0);
  });

  it("salta los caracteres descartados, no los cuenta como pendientes", () => {
    const items = [discarded(), { label: "", discarded: false }, pending("1")];
    expect(findNextPendingIndex(items, 0)).toBe(1);
  });

  it("devuelve null cuando no queda ningún carácter pendiente", () => {
    const items = [pending("1"), pending("2"), discarded()];
    expect(findNextPendingIndex(items, 0)).toBeNull();
  });

  it("devuelve null en una lista vacía, sin lanzar", () => {
    expect(findNextPendingIndex([], -1)).toBeNull();
  });

  it("fromIndex=-1 (estado inicial, ningún carácter enfocado todavía) empieza la búsqueda en el índice 0", () => {
    const items = [{ label: "", discarded: false }, pending("1")];
    expect(findNextPendingIndex(items, -1)).toBe(0);
  });
});
