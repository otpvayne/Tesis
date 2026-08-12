/**
 * Valida que un valor recibido de un query param (controlado por el
 * cliente, ej. `?back=...`) sea una ruta interna segura antes de usarlo
 * como destino de navegación. Sin esto, un enlace manipulado con
 * `?back=https://evil.com` o `?back=//evil.com` podría usar nuestro
 * dominio para redirigir a un sitio externo (RNF-003: no confiar en
 * entrada del cliente).
 */
export function safeInternalPath(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}
