/**
 * Piso mínimo de sanidad para una captura, no un umbral de calidad
 * validado para OCR (no hay pipeline OCR todavía contra el cual calibrar
 * eso — Fase 4).
 *
 * Bajado de 800×600 a 640×480 (decisión explícita del equipo, post-Fase 3)
 * tras testing real: el umbral anterior rechazaba capturas de
 * dispositivos/navegadores que entregan streams de menor resolución por
 * defecto (`getUserMedia()` en `use-camera-stream.ts` no pide
 * `width`/`height`, así que el navegador elige). 640×480px es el mínimo
 * práctico que soportan dispositivos desde ~2015 en adelante — bajar más
 * dejaría de ser realista. Valores menores a este piso pueden impactar la
 * precisión del OCR; eso se mide con datos reales en Fase 4 (evaluación),
 * no se asume aquí.
 */
export const MIN_CAPTURE_WIDTH = 640;
export const MIN_CAPTURE_HEIGHT = 480;

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
