"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/modules/audit/log";
import type { Json } from "@/types/database";
import type { SaveOcrResultInput, SaveOcrResultOutput } from "@/modules/documents/document-processing-types";

/**
 * Persiste el resultado de un procesamiento OCR ya ejecutado — **no
 * ejecuta el pipeline aquí**. `decodeImage` (Fase 4a) usa
 * `createImageBitmap` + `<canvas>`, APIs de navegador que no existen en
 * el runtime de Node de una Server Action; el pipeline completo
 * (`runOCRPipeline` + `extractFields`) corre en el cliente
 * (`process-document-client.tsx`), que llama aquí solo para guardar el
 * resultado ya calculado. Mismo patrón ya usado en Fase 4c/4d
 * (`saveLabeledSamples`, `saveSyntheticModel`): el cliente calcula, el
 * servidor persiste y aplica RLS.
 *
 * No se duplica la verificación "¿el usuario es dueño de este
 * documento?" — la política RLS `ocr_results_insert_via_document` ya la
 * aplica (rechaza el insert si no hay un `documents` con
 * `owner_id = auth.uid()` para `documentId`, salvo admin). Si el insert
 * falla por eso, `error` lo refleja y se propaga como excepción.
 */
export async function saveOcrResult(input: SaveOcrResultInput): Promise<SaveOcrResultOutput> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error("No autenticado.");
  }

  const extractedForStorage = {
    proveedor: input.extractedData.proveedor,
    nit: input.extractedData.nit,
    fecha: input.extractedData.fecha,
    iva: input.extractedData.iva,
    valor: input.extractedData.valor,
    total: input.extractedData.total,
  } as unknown as Json;

  const { data: inserted, error } = await supabase
    .from("ocr_results")
    .insert({
      document_id: input.documentId,
      model_id: input.modelId,
      raw_text: input.rawText,
      extracted_data: extractedForStorage,
      confidence: input.confidence,
      processing_ms: Math.round(input.processingMs),
    })
    .select("id")
    .single();

  if (error || !inserted) {
    throw new Error(`No se pudo guardar el resultado OCR: ${error?.message ?? "sin fila devuelta (¿el documento no es tuyo?)"}`);
  }

  const { error: statusError } = await supabase.from("documents").update({ status: "processed" }).eq("id", input.documentId);
  if (statusError) {
    // El resultado OCR ya quedó guardado (registro histórico inmutable,
    // no se revierte) -- un fallo actualizando el status no debe
    // presentarse como si el OCR hubiera fallado. Se registra y sigue.
    console.error(`[document-processing] no se pudo actualizar status a 'processed' para ${input.documentId}:`, statusError.message);
  }

  await logAuditEvent(supabase, {
    actorId: user.id,
    action: "OCR_COMPLETED",
    documentId: input.documentId,
    metadata: { confidence: input.confidence, processingMs: input.processingMs },
  });

  revalidatePath(`/documents/${input.documentId}`);
  return { ocrResultId: inserted.id };
}

/** El cliente llama esto si el pipeline/extracción lanzó una excepción — deja `documents.status='failed'` en vez de dejarlo colgado en `processing`, y audita `OCR_FAILED`. */
export async function markOcrFailed(documentId: string, errorMessage: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("documents").update({ status: "failed" }).eq("id", documentId);
  await logAuditEvent(supabase, {
    actorId: user.id,
    action: "OCR_FAILED",
    documentId,
    metadata: { error: errorMessage },
  });

  revalidatePath(`/documents/${documentId}`);
}

/** El cliente llama esto justo antes de empezar a decodificar/procesar, para que `documents.status` refleje "en proceso" mientras corre en el navegador (puede tardar varios segundos, ver benchmark en `docs/ocr/extraction.md`). */
export async function markOcrStarted(documentId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("documents").update({ status: "processing" }).eq("id", documentId);
  await logAuditEvent(supabase, {
    actorId: user.id,
    action: "OCR_STARTED",
    documentId,
  });

  revalidatePath(`/documents/${documentId}`);
}
