import type { CameraError } from "@/modules/camera/types";

export interface CameraAvailabilityInput {
  /** `typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia`. */
  hasMediaDevices: boolean;
  /** `typeof window !== "undefined" && window.isSecureContext`. */
  isSecureContext: boolean;
}

/**
 * Chequeo previo a llamar `getUserMedia()`. Función pura (recibe los datos
 * del entorno como parámetros en vez de leer `navigator`/`window`
 * directamente) para poder probarla sin un navegador real.
 */
export function checkCameraAvailability(input: CameraAvailabilityInput): CameraError | null {
  if (!input.isSecureContext) {
    return {
      code: "INSECURE_CONTEXT",
      message: "La cámara solo funciona en conexiones seguras (HTTPS). Selecciona una imagen manualmente.",
    };
  }

  if (!input.hasMediaDevices) {
    return {
      code: "BROWSER_UNSUPPORTED",
      message: "Este navegador no admite el acceso a la cámara. Selecciona una imagen manualmente.",
    };
  }

  return null;
}
