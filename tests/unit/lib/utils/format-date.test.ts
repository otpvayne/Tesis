import { describe, expect, it } from "vitest";
import { formatDateTime } from "@/lib/utils/format-date";

describe("formatDateTime", () => {
  it("convierte un timestamp UTC a hora de Colombia (UTC-5), sin duplicar el offset", () => {
    // 22:53 UTC == 17:53 en America/Bogota (UTC-5, sin horario de verano).
    // Corresponde al caso real del bug: un documento subido a las 17:53
    // hora Colombia se guarda como 22:53 UTC.
    expect(formatDateTime("2026-08-11T22:53:00Z")).toBe("11/08/2026, 17:53");
  });

  it("convierte correctamente cuando el offset cruza la medianoche UTC", () => {
    // 02:30 UTC del 12 de agosto == 21:30 del 11 de agosto en Colombia.
    expect(formatDateTime("2026-08-12T02:30:00Z")).toBe("11/08/2026, 21:30");
  });

  it("acepta un objeto Date además de un string ISO", () => {
    const date = new Date("2026-08-11T22:53:00Z");
    expect(formatDateTime(date)).toBe("11/08/2026, 17:53");
  });
});
