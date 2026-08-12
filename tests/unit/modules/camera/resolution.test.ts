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

  it("639×480px NO pasa la validación (área por debajo del mínimo)", () => {
    const result = validateCaptureResolution(639, 480);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("640");
    expect(result.reason).toContain("480");
  });

  // Portrait (celular vertical): ancho×alto = 480×640px. Área = 307 200px,
  // igual al mínimo requerido (640×480) — debe pasar aunque las
  // dimensiones vengan "invertidas" respecto al mínimo declarado.
  it("480×640px (portrait) pasa la validación — misma área que 640×480", () => {
    expect(validateCaptureResolution(480, 640).ok).toBe(true);
  });

  it("acepta una resolución típica de cámara trasera moderna", () => {
    expect(validateCaptureResolution(4032, 3024).ok).toBe(true);
  });

  it("rechaza cuando el área total está por debajo del mínimo aunque un lado sea largo", () => {
    // 2000×100px: un lado muy largo, pero área (200 000px) muy por debajo
    // del mínimo (307 200px) — no debe colarse por tener un lado grande.
    const result = validateCaptureResolution(2000, 100);
    expect(result.ok).toBe(false);
    expect(result.reason).toBeTruthy();
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
