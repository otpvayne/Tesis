/**
 * Piso mínimo de sanidad para una captura, no un umbral de calidad
 * validado para OCR (no hay pipeline OCR todavía contra el cual calibrar
 * eso — Fase 4). 800×600 es muy inferior a lo que cualquier cámara trasera
 * moderna produce; su único propósito es rechazar capturas degeneradas
 * (stream cortado a mitad de frame, canvas mal dimensionado, etc.), no
 * garantizar legibilidad del texto.
 *
 * Confirmado con testing real (Fase 3, refinamiento post-cierre) en un
 * celular Android: una captura salió en 480×640 (por debajo del mínimo) y
 * fue correctamente rechazada. La causa más probable no es que el hardware
 * no dé más resolución, sino que `getUserMedia()` en
 * `use-camera-stream.ts` pide la cámara solo con `facingMode`, sin
 * constraints de `width`/`height` — el navegador es libre de entregar un
 * stream de baja resolución por defecto. Se decidió deliberadamente NO
 * bajar el mínimo a 640×480 para "aceptar" ese caso: el problema real es
 * la falta de constraints en la solicitud del stream, no que el piso esté
 * mal puesto. Bajar el número ocultaría el síntoma sin arreglar la causa.
 * Si se vuelve a ver este rechazo en testing real, la solución correcta es
 * pedir `width: { ideal: ... }, height: { ideal: ... }` en `getUserMedia`,
 * no tocar este archivo. Revisar de nuevo con datos reales cuando exista
 * el pipeline OCR (Fase 4f, evaluación).
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
