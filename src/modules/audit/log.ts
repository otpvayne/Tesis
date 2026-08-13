import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";

/**
 * Espeja el CHECK constraint de audit_logs.action (ver
 * supabase/migrations/20260811200947_create_audit_logs.sql). El tipo
 * generado de Supabase no puede inferir un enum a partir de un CHECK
 * arbitrario, así que se declara aquí para tener autocompletado y chequeo
 * de tipos en cada call site.
 */
export const AUDIT_ACTIONS = [
  "LOGIN",
  "DOCUMENT_CREATED",
  "IMAGE_CAPTURED",
  "OCR_STARTED",
  "OCR_COMPLETED",
  "OCR_FAILED",
  "OCR_VALIDATED",
  "OCR_CORRECTED",
  "DOCUMENT_VIEWED",
  "DOCUMENT_DELETED",
  "MODEL_TRAINED",
  "MODEL_ACTIVATED",
  "DOCUMENT_REJECTED",
  "MODEL_DEACTIVATED",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface LogAuditEventParams {
  actorId: string;
  action: AuditAction;
  documentId?: string;
  metadata?: Record<string, Json>;
}

/**
 * Inserta un evento de auditoría. Nunca lanza: un fallo al auditar no debe
 * tumbar la operación principal (crear/borrar un documento, iniciar
 * sesión) que la originó — se registra en consola para no fallar en
 * silencio total.
 */
export async function logAuditEvent(
  supabase: SupabaseClient<Database>,
  params: LogAuditEventParams,
): Promise<void> {
  const { error } = await supabase.from("audit_logs").insert({
    actor_id: params.actorId,
    action: params.action,
    document_id: params.documentId ?? null,
    metadata: params.metadata ?? {},
  });

  if (error) {
    console.error(`[audit] failed to log "${params.action}":`, error.message);
  }
}
