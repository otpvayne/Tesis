import { describe, expect, it } from "vitest";
import { bucketByDay, computeEditTrend, computeFieldEditStats, computeValidatorStats } from "@/modules/admin/stats";

describe("computeFieldEditStats", () => {
  it("cuenta por campo cuántas validaciones difieren entre original y validado", () => {
    const rows = [
      {
        original_extracted_data: { nit: "123", iva: 10, total: 100 },
        validated_data: { nit: "123", iva: 12, total: 100 },
      },
      {
        original_extracted_data: { nit: "999", iva: 5, total: 50 },
        validated_data: { nit: "888", iva: 5, total: 55 },
      },
    ];

    const result = computeFieldEditStats(rows);

    expect(result.editedFieldsCount).toEqual({
      proveedor: 0,
      nit: 1,
      fecha: 0,
      iva: 1,
      valor: 0,
      total: 1,
    });
    expect(result.totalFieldsEdited).toBe(3);
  });

  it("lista vacía no lanza y devuelve todo en cero", () => {
    const result = computeFieldEditStats([]);
    expect(result.totalFieldsEdited).toBe(0);
    expect(Object.values(result.editedFieldsCount).every((v) => v === 0)).toBe(true);
  });
});

describe("bucketByDay", () => {
  it("agrupa timestamps por día y rellena días sin datos con 0", () => {
    const now = new Date("2026-08-13T12:00:00Z");
    const timestamps = [
      "2026-08-13T08:00:00Z",
      "2026-08-13T09:30:00Z",
      "2026-08-11T23:00:00Z",
    ];

    const buckets = bucketByDay(timestamps, 3, now);

    expect(buckets).toEqual([
      { date: "2026-08-11", count: 1 },
      { date: "2026-08-12", count: 0 },
      { date: "2026-08-13", count: 2 },
    ]);
  });

  it("sin timestamps, todos los buckets quedan en 0", () => {
    const now = new Date("2026-08-13T12:00:00Z");
    const buckets = bucketByDay([], 2, now);
    expect(buckets).toEqual([
      { date: "2026-08-12", count: 0 },
      { date: "2026-08-13", count: 0 },
    ]);
  });
});

describe("computeValidatorStats", () => {
  it("agrupa por validated_by, ordenado descendente por total", () => {
    const rows = [
      { validated_by: "user-a", manually_edited: true, validator: { email: "a@example.com" } },
      { validated_by: "user-b", manually_edited: false, validator: { email: "b@example.com" } },
      { validated_by: "user-a", manually_edited: false, validator: { email: "a@example.com" } },
      { validated_by: "user-a", manually_edited: true, validator: { email: "a@example.com" } },
    ];

    const result = computeValidatorStats(rows);

    expect(result).toEqual([
      { userId: "user-a", email: "a@example.com", totalValidations: 3, editedValidations: 2 },
      { userId: "user-b", email: "b@example.com", totalValidations: 1, editedValidations: 0 },
    ]);
  });

  it("lista vacía no lanza", () => {
    expect(computeValidatorStats([])).toEqual([]);
  });
});

describe("computeEditTrend", () => {
  it("calcula % editado por día, con 0 real para días sin validaciones", () => {
    const now = new Date("2026-08-13T12:00:00Z");
    const rows = [
      { validated_at: "2026-08-13T08:00:00Z", manually_edited: true },
      { validated_at: "2026-08-13T09:00:00Z", manually_edited: false },
      { validated_at: "2026-08-11T08:00:00Z", manually_edited: true },
    ];

    const trend = computeEditTrend(rows, 3, now);

    expect(trend).toEqual([
      { date: "2026-08-11", total: 1, editedPercentage: 100 },
      { date: "2026-08-12", total: 0, editedPercentage: 0 },
      { date: "2026-08-13", total: 2, editedPercentage: 50 },
    ]);
  });

  it("sin filas, todos los días quedan en total 0 / 0%", () => {
    const now = new Date("2026-08-13T12:00:00Z");
    expect(computeEditTrend([], 2, now)).toEqual([
      { date: "2026-08-12", total: 0, editedPercentage: 0 },
      { date: "2026-08-13", total: 0, editedPercentage: 0 },
    ]);
  });
});
