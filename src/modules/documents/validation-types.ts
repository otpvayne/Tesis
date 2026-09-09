import type { DocumentType } from "@/modules/documents/types";

/** Unión de los campos de todos los perfiles OCR (RF-003) -- usado por vistas admin que agregan/reportan a través de todos los tipos de documento (`modules/admin/stats.ts`, `modules/admin/reports.ts`, `/admin/validations`). Para los campos de UN documento concreto, usar `VALIDATION_FIELDS_BY_DOCUMENT_TYPE[doc.document_type]`, no esta lista completa -- ver `documents/[id]/page.tsx`. */
export const VALIDATION_FIELDS = [
  "proveedor",
  "nit",
  "fecha",
  "iva",
  "valor",
  "total",
  "identificacion",
  "valorTotal",
  "vigencia",
  "tipoContrato",
  "numeroContrato",
] as const;
export type ValidationFieldName = (typeof VALIDATION_FIELDS)[number];

/** Campos que realmente extrae/valida cada perfil OCR -- `documents/[id]/page.tsx` y `ValidationSummary` iteran esto (scoped al documento), no `VALIDATION_FIELDS` completo. */
export const VALIDATION_FIELDS_BY_DOCUMENT_TYPE: Record<DocumentType, readonly ValidationFieldName[]> = {
  invoice_es: ["proveedor", "nit", "fecha", "iva", "valor", "total"],
  contract_es: ["proveedor", "identificacion", "fecha", "valorTotal", "vigencia", "tipoContrato", "numeroContrato"],
};

/** Campos numéricos de RF-003 -- el resto son texto. */
export const NUMERIC_VALIDATION_FIELDS: readonly ValidationFieldName[] = ["iva", "valor", "total", "valorTotal"];

/** Campos de texto libre (nombre, tipo, duración) -- el resto son identificadores/fechas/montos, mejor en fuente tabular (`ValidationSection`). */
export const FREEFORM_TEXT_FIELDS: readonly ValidationFieldName[] = ["proveedor", "tipoContrato", "vigencia"];

export type FieldValue = string | number | null;

export interface ValidationFieldInput {
  field: ValidationFieldName;
  /** Valor que salió del OCR (Fase 4e), tal como se muestra al usuario. */
  extractedValue: FieldValue;
  confidence: number;
  /**
   * Presente solo si el usuario editó el campo. `undefined` = el usuario no
   * lo tocó (se guarda `extractedValue` tal cual, sin marcarlo como
   * corregido) -- distinto de `null`, que es un valor corregido a "vacío".
   */
  correctedValue?: FieldValue;
}

export interface SaveValidationInput {
  documentId: string;
  fields: ValidationFieldInput[];
}

export interface SaveValidationOutput {
  validationId: string;
  manuallyEdited: boolean;
  editedFields: ValidationFieldName[];
}

export type ConfidenceLevel = "high" | "medium" | "low";
