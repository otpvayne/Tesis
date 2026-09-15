import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { DocumentType } from "@/modules/documents/types";
import type { FinancialSummaryRow } from "@/modules/documents/financial-summary";

export interface FinancialSummarySource {
  rows: FinancialSummaryRow[];
  /** Documentos del usuario de estos tipos que TODAVÍA no están validados -- no entran en ningún total de `buildFinancialSummary`, se cuentan aparte para el aviso de la UI ("N pendientes de validar"). */
  pendingCount: number;
}

const REPORTABLE_DOCUMENT_TYPES: DocumentType[] = ["invoice_es", "contract_es"];

/**
 * Trae, para el usuario autenticado, sus documentos validados de
 * `invoice_es`/`contract_es` con el `validated_data` de su validación más
 * reciente (un documento puede tener más de una fila en
 * `document_validations` si se revalidó), más un conteo de cuántos
 * documentos de esos tipos aún NO están validados.
 *
 * Deliberadamente NUNCA lee `ocr_results.extracted_data` (dato crudo de
 * OCR, sin revisar) -- RF-008 solo debe sumar dinero sobre dato confirmado
 * por un humano (RF-007), nunca sobre una extracción que nadie confirmó.
 * Este cliente usa la sesión real del usuario (no `service_role`), así que
 * RLS de `documents`/`document_validations` (`owner_id = auth.uid()`)
 * aplica sola -- coincide exactamente con el alcance "por usuario" que
 * pidió el equipo para RF-008 (2026-09-15), sin necesidad de política
 * nueva ni de pasar `ownerId` como filtro adicional de seguridad (se pasa
 * solo porque `.select()` no puede confiar únicamente en RLS para decidir
 * qué WHERE emitir del lado de la app -- ver mismo patrón en
 * `queries.ts`/`listDocuments`).
 */
export async function getFinancialSummarySource(supabase: SupabaseClient<Database>, ownerId: string): Promise<FinancialSummarySource> {
  const [validatedResult, pendingResult] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- el embed de document_validations rompe la inferencia de columnas de PostgREST, mismo motivo documentado en `queries.ts`/`listDocuments`.
    (supabase.from("documents") as any)
      .select("id, document_type, document_validations(validated_data, validated_at)")
      .eq("owner_id", ownerId)
      .eq("status", "validated")
      .in("document_type", REPORTABLE_DOCUMENT_TYPES),
    supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", ownerId)
      .neq("status", "validated")
      .in("document_type", REPORTABLE_DOCUMENT_TYPES),
  ]);

  if (validatedResult.error) throw new Error(`No se pudieron leer documentos validados: ${validatedResult.error.message}`);
  if (pendingResult.error) throw new Error(`No se pudo contar documentos pendientes de validar: ${pendingResult.error.message}`);

  const validatedRows = (validatedResult.data ?? []) as {
    id: string;
    document_type: string;
    document_validations: { validated_data: unknown; validated_at: string }[] | null;
  }[];

  const rows: FinancialSummaryRow[] = validatedRows
    .map((doc) => {
      const validations = doc.document_validations ?? [];
      const latest = [...validations].sort((a, b) => b.validated_at.localeCompare(a.validated_at))[0];
      if (!latest) return null;
      return {
        documentId: doc.id,
        documentType: doc.document_type as DocumentType,
        validatedData: latest.validated_data,
      };
    })
    .filter((row): row is FinancialSummaryRow => row !== null);

  return { rows, pendingCount: pendingResult.count ?? 0 };
}
