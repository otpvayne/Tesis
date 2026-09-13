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

  // `getAll` en vez de `get`: contratos permiten varias fotos
  // (`allowMultiplePages`, ver upload-form.tsx); facturas siguen mandando
  // una sola entrada bajo el mismo nombre, así que esto no les cambia nada.
  const fileEntries = formData.getAll("file").filter((entry): entry is File => entry instanceof File);
  const validations = await Promise.all(fileEntries.map((file) => validateUploadFile(file)));
  const firstError = validations.find((v) => !v.ok);
  if (firstError && !firstError.ok) {
    return { error: firstError.error.message };
  }
  const validatedFiles = validations as Extract<(typeof validations)[number], { ok: true }>[];
  if (validatedFiles.length === 0) {
    return { error: "Selecciona al menos un archivo de imagen." };
  }

  const documentTypeEntry = formData.get("documentType");
  if (!isDocumentType(documentTypeEntry)) {
    return { error: "Tipo de documento inválido." };
  }
  const documentType = documentTypeEntry;

  const documentId = randomUUID();
  const [cover, ...extraPages] = validatedFiles;
  const coverExtension = extensionForMime(cover.mime);
  const coverPath = `${user.id}/${documentId}/original.${coverExtension}`;

  const { error: uploadError } = await supabase.storage
    .from(DOCUMENTS_STORAGE_BUCKET)
    .upload(coverPath, cover.bytes, { contentType: cover.mime, upsert: false });

  if (uploadError) {
    return { error: `No se pudo subir el archivo: ${uploadError.message}` };
  }

  const { error: insertError } = await supabase.from("documents").insert({
    id: documentId,
    owner_id: user.id,
    document_type: documentType,
    original_file_path: coverPath,
    status: "uploaded",
  });

  if (insertError) {
    // El objeto ya subido a Storage queda huérfano si esto falla. Sin job
    // de limpieza en esta fase — deuda técnica documentada en el cierre.
    return { error: `No se pudo registrar el documento: ${insertError.message}` };
  }

  // Páginas adicionales (contratos multi-página): mismo bucket, ruta
  // page-{n}. Si una falla a mitad de camino, el documento y las páginas ya
  // subidas quedan como están -- misma deuda técnica de "sin limpieza
  // automática" que ya existía para la portada, documentada arriba.
  for (const [index, page] of extraPages.entries()) {
    const pageNumber = index + 2;
    const pageExtension = extensionForMime(page.mime);
    const pagePath = `${user.id}/${documentId}/page-${pageNumber}.${pageExtension}`;

    const { error: pageUploadError } = await supabase.storage
      .from(DOCUMENTS_STORAGE_BUCKET)
      .upload(pagePath, page.bytes, { contentType: page.mime, upsert: false });
    if (pageUploadError) {
      return { error: `No se pudo subir la página ${pageNumber}: ${pageUploadError.message}` };
    }

    const { error: pageInsertError } = await supabase.from("document_pages").insert({
      document_id: documentId,
      page_number: pageNumber,
      file_path: pagePath,
    });
    if (pageInsertError) {
      return { error: `No se pudo registrar la página ${pageNumber}: ${pageInsertError.message}` };
    }
  }

  await logAuditEvent(supabase, {
    actorId: user.id,
    action: "DOCUMENT_CREATED",
    documentId,
    metadata: { document_type: documentType, mime: cover.mime, page_count: validatedFiles.length },
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

  const { data: pages } = await supabase
    .from("document_pages")
    .select("file_path")
    .eq("document_id", documentId);

  const pathsToRemove = [doc.original_file_path, ...(pages ?? []).map((p) => p.file_path)];
  await supabase.storage.from(DOCUMENTS_STORAGE_BUCKET).remove(pathsToRemove);

  // `document_pages` cae por `on delete cascade` -- no hace falta borrarla aparte.
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
