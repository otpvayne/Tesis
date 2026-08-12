export interface MobileDetectionInput {
  /** `navigator.userAgentData?.mobile` — solo Chromium; `undefined` en Safari/Firefox. */
  userAgentDataMobile: boolean | undefined;
  /** `navigator.maxTouchPoints` — fallback cuando `userAgentData` no existe. */
  maxTouchPoints: number | undefined;
}

/**
 * Determina si el dispositivo es "móvil" para decidir si se ofrece la
 * cámara como camino principal (RF-001/RNF-002, mobile first) o si se
 * muestra solo el selector de archivo en desktop. `userAgentData.mobile`
 * es la señal más confiable cuando existe (no es heurística, el propio
 * navegador la declara); `maxTouchPoints > 2` es el fallback para
 * navegadores que no exponen `userAgentData` (Safari, Firefox) — >2 en vez
 * de >0 porque algunos trackpads/pantallas de laptop reportan
 * `maxTouchPoints` bajo sin ser dispositivos táctiles móviles.
 */
export function isMobileDevice(input: MobileDetectionInput): boolean {
  if (typeof input.userAgentDataMobile === "boolean") {
    return input.userAgentDataMobile;
  }
  return (input.maxTouchPoints ?? 0) > 2;
}
