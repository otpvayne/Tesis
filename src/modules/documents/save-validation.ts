"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/modules/audit/log";
import type { Json } from "@/types/database";
import { buildValidationPayload } from "@/modules/documents/validation-logic";
import type { SaveValidationInput, SaveValidationOutput } from "@/modules/documents/validation-types";

/**
 * Persiste una validación humana (RF-007) en `document_validations` y marca
 * el documento como `validated`. `validated_by` sale de la sesión
 * autenticada del servidor, nunca de un campo que mande el cliente
 * (`CLAUDE.md` §6: la seguridad no depende del frontend) -- a diferencia
 * del `userId` que trae `SaveValidationRequest` en el enunciado original de
 * esta fase, que confiaría en un valor que el cliente podría falsificar.
 *
 * `document_validations` es histórica e inmutable (sin UPDATE/DELETE, ver
 * su migración) -- cada llamada crea una fila nueva; "la validación
 * actual" es siempre la más reciente por `validated_at`, mismo patrón que
 * `ocr_results`.
 */
export async function saveValidation(input: SaveValidationInput): Promise<SaveValidationOutput> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("No autenticado.");
  }

  const { originalExtractedData, validatedData, manuallyEdited, editedFields } = buildValidationPayload(input.fields);

  const { data: inserted, error } = await supabase
    .from("document_validations")
    .insert({
      document_id: input.documentId,
      original_extracted_data: originalExtractedData as unknown as Json,
      validated_data: validatedData as unknown as Json,
      manually_edited: manuallyEdited,
      validated_by: user.id,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    throw new Error(`No se pudo guardar la validación: ${error?.message ?? "sin fila devuelta (¿el documento no es tuyo?)"}`);
  }

  const { error: statusError } = await supabase.from("documents").update({ status: "validated" }).eq("id", input.documentId);
  if (statusError) {
    // La validación ya quedó guardada (registro histórico inmutable, no se
    // revierte) -- un fallo actualizando el status no debe presentarse
    // como si la validación hubiera fallado. Mismo criterio que
    // saveOcrResult en document-processing.ts.
    console.error(`[save-validation] no se pudo actualizar status a 'validated' para ${input.documentId}:`, statusError.message);
  }

  await logAuditEvent(supabase, {
    actorId: user.id,
    action: manuallyEdited ? "OCR_CORRECTED" : "OCR_VALIDATED",
    documentId: input.documentId,
    metadata: { editedFields },
  });

  revalidatePath(`/documents/${input.documentId}`);
  return { validationId: inserted.id, manuallyEdited, editedFields };
}

/**
 * Marca un documento como `rejected` -- el usuario decidió que el OCR/la
 * captura no sirve y no debe usarse para nada (ni mostrarse como válido ni
 * entrar a un futuro reentrenamiento). No crea una fila en
 * `document_validations`: no hay "datos validados" que guardar, es un
 * documento descartado.
 */
export async function rejectDocument(documentId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("No autenticado.");
  }

  const { error } = await supabase.from("documents").update({ status: "rejected" }).eq("id", documentId);
  if (error) {
    throw new Error(`No se pudo rechazar el documento: ${error.message}`);
  }

  await logAuditEvent(supabase, {
    actorId: user.id,
    action: "DOCUMENT_REJECTED",
    documentId,
  });

  revalidatePath(`/documents/${documentId}`);
}
