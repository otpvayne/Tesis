/** Debe coincidir con el bucket creado en supabase/migrations/*_create_documents_storage_bucket.sql. */
export const DOCUMENTS_STORAGE_BUCKET = "documents";

export const DOCUMENT_TYPES = ["invoice_es"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_STATUSES = [
  "uploaded",
  "processing",
  "processed",
  "validated",
  "failed",
  "rejected",
] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];
