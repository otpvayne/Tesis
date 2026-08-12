import { describe, expect, it } from "vitest";
import {
  MIN_CAPTURE_HEIGHT,
  MIN_CAPTURE_WIDTH,
  validateCaptureResolution,
} from "@/modules/camera/resolution";

describe("validateCaptureResolution", () => {
  it("acepta una resolución igual al mínimo exacto (inclusivo)", () => {
    expect(validateCaptureResolution(MIN_CAPTURE_WIDTH, MIN_CAPTURE_HEIGHT).ok).toBe(true);
  });

  // Valores literales (no derivados de las constantes) a propósito: si el
  // piso vuelve a cambiar, este test debe fallar de forma visible en vez
  // de moverse solo junto con la constante.
  it("640×480px pasa la validación", () => {
    expect(validateCaptureResolution(640, 480).ok).toBe(true);
  });

  it("639×480px NO pasa la validación (un píxel por debajo del ancho mínimo)", () => {
    const result = validateCaptureResolution(639, 480);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("640");
    expect(result.reason).toContain("480");
  });

  it("acepta una resolución típica de cámara trasera moderna", () => {
    expect(validateCaptureResolution(4032, 3024).ok).toBe(true);
  });

  it("rechaza cuando el ancho está por debajo del mínimo", () => {
    const result = validateCaptureResolution(MIN_CAPTURE_WIDTH - 1, MIN_CAPTURE_HEIGHT);
    expect(result.ok).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it("rechaza cuando el alto está por debajo del mínimo", () => {
    const result = validateCaptureResolution(MIN_CAPTURE_WIDTH, MIN_CAPTURE_HEIGHT - 1);
    expect(result.ok).toBe(false);
  });

  it("rechaza cuando ambas dimensiones están por debajo del mínimo", () => {
    expect(validateCaptureResolution(100, 100).ok).toBe(false);
  });

  it("el mensaje de rechazo incluye las dimensiones recibidas", () => {
    const result = validateCaptureResolution(320, 240);
    expect(result.reason).toContain("320");
    expect(result.reason).toContain("240");
  });
});
