import { NUMERIC_VALIDATION_FIELDS, type ConfidenceLevel, type FieldValue, type ValidationFieldInput, type ValidationFieldName } from "@/modules/documents/validation-types";

/**
 * Umbrales de color de confianza para la tabla de validación (Fase 5):
 * verde >90%, amarillo 75-90%, rojo <75%. Es una ayuda visual sobre el
 * confidence real ya calculado por el pipeline OCR (Fase 4e/§9 de
 * `docs/ocr/algorithms.md`) -- no es una afirmación de accuracy medida.
 */
export function computeConfidenceLevel(confidence: number): ConfidenceLevel {
  if (confidence > 0.9) return "high";
  if (confidence >= 0.75) return "medium";
  return "low";
}

export interface ParsedFieldValue {
  ok: boolean;
  value: FieldValue;
  error?: string;
}

/**
 * Convierte lo que el usuario escribió en el input a un `FieldValue` del
 * tipo correcto para el campo (número para iva/valor/total, texto para el
 * resto) -- validación en el límite del sistema (`CLAUDE.md` §9), nunca se
 * confía en que el string tecleado ya sea válido.
 */
export function parseFieldValue(field: ValidationFieldName, raw: string): ParsedFieldValue {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return { ok: true, value: null };
  }

  if (NUMERIC_VALIDATION_FIELDS.includes(field)) {
    const num = Number(trimmed);
    if (Number.isNaN(num)) {
      return { ok: false, value: null, error: `"${raw}" no es un número válido.` };
    }
    return { ok: true, value: num };
  }

  return { ok: true, value: trimmed };
}

export interface ValidationPayload {
  originalExtractedData: Record<ValidationFieldName, FieldValue>;
  validatedData: Record<ValidationFieldName, FieldValue>;
  manuallyEdited: boolean;
  editedFields: ValidationFieldName[];
}

/**
 * Núcleo puro de `saveValidation` (server action) -- separado para poder
 * probarlo sin `createClient()`/cookies de Next (mismo patrón de
 * "core puro + wrapper" usado en `modules/ocr/evaluation/*`). Un campo
 * cuenta como editado solo si `correctedValue` está presente Y es
 * distinto de `extractedValue` -- si el usuario abrió "Editar" y volvió a
 * confirmar el mismo valor, no cuenta como corrección.
 */
export function buildValidationPayload(fields: ValidationFieldInput[]): ValidationPayload {
  const originalExtractedData = {} as Record<ValidationFieldName, FieldValue>;
  const validatedData = {} as Record<ValidationFieldName, FieldValue>;
  const editedFields: ValidationFieldName[] = [];

  for (const f of fields) {
    originalExtractedData[f.field] = f.extractedValue;

    const wasEdited = f.correctedValue !== undefined && f.correctedValue !== f.extractedValue;
    validatedData[f.field] = wasEdited ? f.correctedValue! : f.extractedValue;
    if (wasEdited) editedFields.push(f.field);
  }

  return {
    originalExtractedData,
    validatedData,
    manuallyEdited: editedFields.length > 0,
    editedFields,
  };
}
