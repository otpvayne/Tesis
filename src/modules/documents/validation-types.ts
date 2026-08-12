export const VALIDATION_FIELDS = ["proveedor", "nit", "fecha", "iva", "valor", "total"] as const;
export type ValidationFieldName = (typeof VALIDATION_FIELDS)[number];

/** Campos numéricos de RF-003 -- el resto (`proveedor`, `nit`, `fecha`) son texto. */
export const NUMERIC_VALIDATION_FIELDS: readonly ValidationFieldName[] = ["iva", "valor", "total"];

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
