import type { DocumentStatus, DocumentType } from "@/modules/documents/types";

/**
 * Los valores internos (`invoice_es`, `uploaded`, etc.) quedan en inglés a
 * propósito — son los que vive el esquema, el código y RLS. Este es el
 * único lugar donde se traducen a español para mostrarlos en la UI; los
 * componentes no deben hardcodear su propia traducción suelta.
 */
export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  invoice_es: "Factura",
};

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  uploaded: "Cargado",
  processing: "Procesando",
  processed: "Procesado",
  validated: "Validado",
  failed: "Error",
};

/**
 * Acepta `string` (no `DocumentType`) porque las columnas `document_type`/
 * `status` llegan como `string` desde el cliente de Supabase generado (un
 * CHECK constraint de Postgres no produce un enum en los tipos generados).
 * Si el valor no está en el mapa, se devuelve tal cual en vez de fallar —
 * evita romper la UI si se agrega un valor nuevo en la base antes de
 * actualizar este archivo.
 */
export function getDocumentTypeLabel(type: string): string {
  return DOCUMENT_TYPE_LABELS[type as DocumentType] ?? type;
}

export function getDocumentStatusLabel(status: string): string {
  return DOCUMENT_STATUS_LABELS[status as DocumentStatus] ?? status;
}
