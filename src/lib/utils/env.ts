/**
 * Falla rápido y con un mensaje claro si una variable de entorno requerida no
 * está presente, en vez de dejar que `undefined` se propague silenciosamente
 * hasta un cliente de Supabase mal configurado (límite del sistema, RNF-003).
 */
export function requireEnv(name: string, value: string | undefined): string {
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
