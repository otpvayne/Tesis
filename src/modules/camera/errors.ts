import type { CameraError } from "@/modules/camera/types";

/**
 * Traduce un error real de `getUserMedia()`/captura a un `CameraError` con
 * mensaje en español. Basado en los nombres de `DOMException` documentados
 * por la especificación de Media Capture and Streams (MDN); cualquier caso
 * no reconocido cae en `CAPTURE_ERROR` genérico en vez de propagar el
 * mensaje crudo del navegador.
 */
export function classifyCameraError(error: unknown): CameraError {
  const name = error instanceof DOMException ? error.name : undefined;

  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return {
        code: "PERMISSION_DENIED",
        message:
          "No se pudo acceder a la cámara porque el permiso fue denegado. Actívalo en la configuración del navegador e intenta de nuevo.",
      };
    case "NotFoundError":
    case "OverconstrainedError":
      return {
        code: "CAMERA_UNAVAILABLE",
        message: "No encontramos una cámara disponible en este dispositivo.",
      };
    case "NotReadableError":
    case "AbortError":
      return {
        code: "CAMERA_UNAVAILABLE",
        message:
          "La cámara no responde o está siendo usada por otra aplicación. Ciérrala e intenta de nuevo.",
      };
    default:
      return {
        code: "CAPTURE_ERROR",
        message: "No pudimos usar la cámara. Intenta de nuevo o selecciona una imagen manualmente.",
      };
  }
}
