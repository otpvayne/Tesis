"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logAuditEvent } from "@/modules/audit/log";
import { extensionForMime, validateUploadFile } from "@/modules/documents/validation";
import { DOCUMENT_TYPES, DOCUMENTS_STORAGE_BUCKET, type DocumentType } from "@/modules/documents/types";
import type { CreateDocumentState } from "@/modules/documents/state";

function isDocumentType(value: FormDataEntryValue | null): value is DocumentType {
  return typeof value === "string" && (DOCUMENT_TYPES as readonly string[]).includes(value);
}

export async function createDocument(
  _prevState: CreateDocumentState,
  formData: FormData,
): Promise<CreateDocumentState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Sesión expirada. Inicia sesión de nuevo." };
  }

  const fileEntry = formData.get("file");
  const validation = await validateUploadFile(fileEntry instanceof File ? fileEntry : null);
  if (!validation.ok) {
    return { error: validation.error.message };
  }

  const documentTypeEntry = formData.get("documentType");
  if (!isDocumentType(documentTypeEntry)) {
    return { error: "Tipo de documento inválido." };
  }
  const documentType = documentTypeEntry;

  const documentId = randomUUID();
  const extension = extensionForMime(validation.mime);
  const path = `${user.id}/${documentId}/original.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from(DOCUMENTS_STORAGE_BUCKET)
    .upload(path, validation.bytes, { contentType: validation.mime, upsert: false });

  if (uploadError) {
    return { error: `No se pudo subir el archivo: ${uploadError.message}` };
  }

  const { error: insertError } = await supabase.from("documents").insert({
    id: documentId,
    owner_id: user.id,
    document_type: documentType,
    original_file_path: path,
    status: "uploaded",
  });

  if (insertError) {
    // El objeto ya subido a Storage queda huérfano si esto falla. Sin job
    // de limpieza en esta fase — deuda técnica documentada en el cierre.
    return { error: `No se pudo registrar el documento: ${insertError.message}` };
  }

  await logAuditEvent(supabase, {
    actorId: user.id,
    action: "DOCUMENT_CREATED",
    documentId,
    metadata: { document_type: documentType, mime: validation.mime },
  });

  revalidatePath("/documents");
  revalidatePath("/contracts");
  redirect(`/documents/${documentId}`);
}

export async function deleteDocument(documentId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: doc } = await supabase
    .from("documents")
    .select("id, original_file_path")
    .eq("id", documentId)
    .single();

  if (!doc) {
    redirect("/documents");
  }

  await supabase.storage.from(DOCUMENTS_STORAGE_BUCKET).remove([doc.original_file_path]);

  const { error } = await supabase.from("documents").delete().eq("id", documentId);

  if (!error) {
    await logAuditEvent(supabase, {
      actorId: user.id,
      action: "DOCUMENT_DELETED",
      documentId,
    });
  }

  revalidatePath("/documents");
  redirect("/documents");
}
