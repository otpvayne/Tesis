/**
 * Piso mínimo de sanidad para una captura, no un umbral de calidad
 * validado para OCR (no hay pipeline OCR todavía contra el cual calibrar
 * eso — Fase 4). 800×600 es muy inferior a lo que cualquier cámara trasera
 * moderna produce; su único propósito es rechazar capturas degeneradas
 * (stream cortado a mitad de frame, canvas mal dimensionado, etc.), no
 * garantizar legibilidad del texto. Revisar este valor con datos reales
 * cuando exista el pipeline OCR (Fase 4f, evaluación).
 */
export const MIN_CAPTURE_WIDTH = 800;
export const MIN_CAPTURE_HEIGHT = 600;

export interface ResolutionCheckResult {
  ok: boolean;
  reason?: string;
}

export function validateCaptureResolution(width: number, height: number): ResolutionCheckResult {
  if (width < MIN_CAPTURE_WIDTH || height < MIN_CAPTURE_HEIGHT) {
    return {
      ok: false,
      reason: `La imagen es muy pequeña (${width}×${height}px). Se necesita al menos ${MIN_CAPTURE_WIDTH}×${MIN_CAPTURE_HEIGHT}px.`,
    };
  }

  return { ok: true };
}
