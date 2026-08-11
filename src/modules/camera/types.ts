/**
 * Códigos de error internos del módulo de cámara (RNF-007). Cada uno lleva
 * un mensaje en español pensado para el usuario final — nunca se muestra
 * el mensaje crudo del navegador (ej. "Permission denied").
 */
export const CAMERA_ERROR_CODES = [
  "PERMISSION_DENIED",
  "CAMERA_UNAVAILABLE",
  "BROWSER_UNSUPPORTED",
  "INSECURE_CONTEXT",
  "CAPTURE_ERROR",
] as const;
export type CameraErrorCode = (typeof CAMERA_ERROR_CODES)[number];

export interface CameraError {
  code: CameraErrorCode;
  message: string;
}
